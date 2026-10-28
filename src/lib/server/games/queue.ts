import { collectAssets } from './maintenance';
import { collectStoryImages } from '#lib/server/story-image-cleanup';
import { createWorkerTask, requireWorkerConfig } from '#lib/server/worker';
import { reconcileStoryJobs } from '#lib/server/story-jobs';
export { verifyWorker } from '#lib/server/worker';
import { getSupabase } from '#lib/server/db';
import { checkResult, rpc } from './common';
import { enqueueGeneration } from './generation';
export async function enqueueAndDispatchGeneration(
	childId: number,
	favoriteId: string,
	key: string
) {
	const job = await enqueueGeneration(childId, favoriteId, key);
	try {
		// Await durable task delivery before responding; generation runs in the worker.
		await dispatchOutbox(job.id);
	} catch {
		// The persisted outbox remains available for scheduled recovery.
		console.error('word-kitchen.dispatch', { jobId: job.id, failed: true });
	}
	return { id: job.id, status: job.status };
}
export async function dispatchOutbox(jobId?: string) {
	requireWorkerConfig();
	const db = await getSupabase();
	let query = db.from('game_outbox').select('id,payload,next_attempt_at').is('delivered_at', null);
	if (jobId) query = query.eq('job_id', jobId);
	const rows =
		checkResult(await query.order('next_attempt_at', { ascending: true }).limit(50)) ?? [];
	// Do not let a batch of unavailable deliveries occupy an entire worker request.
	// Unattempted rows remain durable for the next dispatcher/reconciler invocation.
	const dispatchUntil = Date.now() + 30000;
	for (const row of rows) {
		if (Date.now() >= dispatchUntil) break;
		try {
			await createWorkerTask({
				id: `wk-${row.id}`,
				path: '/api/internal/word-kitchen/worker',
				payload: row.payload,
				notBefore: row.next_attempt_at
			});
		} catch {
			console.error('word-kitchen.dispatch', { outboxId: row.id, failed: true });
			continue;
		}
		checkResult(
			await db
				.from('game_outbox')
				.update({ delivered_at: new Date().toISOString() })
				.eq('id', row.id)
		);
	}
}
export async function reconcile() {
	const maintenance = [
		[
			'generation',
			async () => {
				await rpc('wk_reconcile_jobs', {});
				await dispatchOutbox();
			}
		],
		['kitchen-assets', collectAssets],
		['story-images', collectStoryImages],
		['story-jobs', reconcileStoryJobs]
	] as const;
	const results = await Promise.allSettled(maintenance.map(([, run]) => run()));
	const failed = results.flatMap((result, index) =>
		result.status === 'rejected' ? [maintenance[index][0]] : []
	);
	if (failed.length) {
		console.error('maintenance.failed', { tasks: failed });
		throw new Error('Scheduled maintenance needs a retry.');
	}
}
