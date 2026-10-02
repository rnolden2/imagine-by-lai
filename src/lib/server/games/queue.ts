import { collectAssets } from './maintenance';
import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';
import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { checkResult, rpc } from './common';
import { enqueueGeneration, requireWorkerConfig } from './generation';
const tasks = new CloudTasksClient();
const auth = new OAuth2Client();
export async function verifyWorker(event: RequestEvent) {
	requireWorkerConfig();
	const token = event.request.headers.get('authorization')?.replace(/^Bearer /, '');
	if (!token) error(401, 'Worker authentication required.');
	try {
		const ticket = await auth.verifyIdToken({
			idToken: token,
			audience: env.WORD_KITCHEN_WORKER_URL
		});
		const claims = ticket.getPayload();
		if (!claims?.email_verified || claims.email !== env.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT)
			throw new Error('INVALID_WORKER');
	} catch {
		error(403, 'Worker authentication failed.');
	}
}
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
	return job;
}
export async function dispatchOutbox(jobId?: string) {
	requireWorkerConfig();
	const db = await getSupabase();
	let query = db.from('game_outbox').select('*').is('delivered_at', null);
	if (jobId) query = query.eq('job_id', jobId);
	const rows =
		checkResult(await query.order('next_attempt_at', { ascending: true }).limit(50)) ?? [];
	for (const row of rows) {
		try {
			await tasks.createTask({
				parent: env.WORD_KITCHEN_TASK_QUEUE,
				task: {
					name: `${env.WORD_KITCHEN_TASK_QUEUE}/tasks/wk-${row.id}`,
					// Hand delayed retries to Cloud Tasks now, so they do not wait for recovery.
					scheduleTime: { seconds: Math.ceil(new Date(row.next_attempt_at).getTime() / 1000) },
					dispatchDeadline: { seconds: 300 },
					httpRequest: {
						httpMethod: 'POST',
						url: `${env.WORD_KITCHEN_WORKER_URL}/api/internal/word-kitchen/worker`,
						headers: { 'Content-Type': 'application/json' },
						body: Buffer.from(JSON.stringify(row.payload)).toString('base64'),
						oidcToken: {
							serviceAccountEmail: env.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT,
							audience: env.WORD_KITCHEN_WORKER_URL
						}
					}
				}
			});
		} catch (e) {
			if ((e as { code?: number }).code !== 6) {
				console.error('word-kitchen.dispatch', { outboxId: row.id, failed: true });
				continue;
			}
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
	await rpc('wk_reconcile_jobs', {});
	await dispatchOutbox();
	await collectAssets();
}
