import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from '../../../../scripts/word-kitchen/test-db.mjs';
import type { GenerationQuota } from '$lib/games/word-kitchen/generation-quota';

let db: PGlite;
beforeEach(async () => {
	db = await createTestDatabase();
}, 30000);
afterEach(async () => {
	await db?.close();
});
async function quota() {
	return (await db.query<{ quota: GenerationQuota }>('select wk_generation_quota(5) quota')).rows[0]
		.quota;
}
async function enqueue(key = randomUUID(), child = 1) {
	return (
		await db.query<{ job: { id: string } }>(`select wk_enqueue_job($1,$2,$3,'hash','{}',5) job`, [
			randomUUID(),
			child,
			key
		])
	).rows[0].job;
}
async function reset(key = randomUUID()) {
	return (
		await db.query<{ quota: GenerationQuota }>('select wk_reset_generation_limit($1,5) quota', [
			key
		])
	).rows[0].quota;
}
async function finish(id: string, status = 'failed') {
	await db.query('update game_generation_jobs set status=$2 where id=$1', [id, status]);
}

it('restores five starts after failed and cancelled jobs without deleting history or reservations', async () => {
	for (let i = 0; i < 5; i++) {
		const job = await enqueue(randomUUID(), (i % 2) + 1);
		await finish(job.id, i % 2 ? 'cancelled' : 'failed');
	}
	expect(await quota()).toMatchObject({ used: 5, remaining: 0, limit: 5 });
	await expect(enqueue()).rejects.toThrow('DAILY_LIMIT');
	const jobsBefore = await db.query(
		'select id,status,created_at,estimated_cost from game_generation_jobs order by id'
	);
	const costsBefore = await db.query('select * from game_cost_reservations order by id');
	expect(await reset()).toMatchObject({ used: 0, remaining: 5 });
	expect(
		(
			await db.query(
				'select id,status,created_at,estimated_cost from game_generation_jobs order by id'
			)
		).rows
	).toEqual(jobsBefore.rows);
	expect((await db.query('select * from game_cost_reservations order by id')).rows).toEqual(
		costsBefore.rows
	);
	expect((await db.query('select jobs_reset from game_generation_limit_resets')).rows).toEqual([
		{ jobs_reset: 5 }
	]);
	await enqueue();
	expect(await quota()).toMatchObject({ used: 1, remaining: 4 });
});

it('does not reset newly consumed allowance when an admin request is replayed', async () => {
	const originalKey = randomUUID();
	const original = await enqueue(originalKey);
	await finish(original.id);
	const resetKey = randomUUID();
	await reset(resetKey);
	const fresh = await enqueue();
	await finish(fresh.id);
	expect(await reset(resetKey)).toMatchObject({ used: 1, remaining: 4 });
	expect((await db.query('select id from game_generation_limit_resets')).rows).toHaveLength(1);
	// Replaying an old generation request never purchases a replacement job.
	expect((await enqueue(originalKey)).id).toBe(original.id);
	expect(await quota()).toMatchObject({ used: 1 });
});

it('preserves the active-job guard and daily spending cap after reset', async () => {
	const job = await enqueue();
	await reset();
	await expect(enqueue()).rejects.toThrow('GENERATION_BUSY');
	await finish(job.id);
	await db.query('update game_cost_reservations set estimated=5 where job_id=$1', [job.id]);
	await reset();
	await expect(enqueue()).rejects.toThrow('BUDGET_EXCEEDED');
	expect(await quota()).toMatchObject({ remaining: 5 });
});

it('counts UTC days and does not change earlier-day jobs when resetting', async () => {
	await db.exec("set timezone='America/Los_Angeles'");
	const old = await enqueue();
	await finish(old.id);
	await db.query(
		`update game_generation_jobs set created_at=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')-interval '1 second' where id=$1`,
		[old.id]
	);
	expect(await quota()).toMatchObject({ used: 0, remaining: 5 });
	const today = await enqueue();
	await finish(today.id);
	await reset();
	const jobs = await db.query<{ id: string; daily_limit_reset_id: string | null }>(
		'select id,daily_limit_reset_id from game_generation_jobs'
	);
	expect(jobs.rows.find((j) => j.id === old.id)?.daily_limit_reset_id).toBeNull();
	expect(jobs.rows.find((j) => j.id === today.id)?.daily_limit_reset_id).not.toBeNull();
	expect(new Date((await quota()).resetsAt).getUTCHours()).toBe(0);
});

it('restricts quota reset records and RPCs to the server role', async () => {
	for (const role of ['anon', 'authenticated']) {
		const row = (
			await db.query<{ table_access: boolean; rpc_access: boolean }>(
				`select has_table_privilege($1,'game_generation_limit_resets','select') table_access,
			 has_function_privilege($1,'wk_reset_generation_limit(uuid,integer)','execute') rpc_access`,
				[role]
			)
		).rows[0];
		expect(row).toEqual({ table_access: false, rpc_access: false });
	}
	await db.exec('set role service_role');
	expect(await reset()).toMatchObject({ remaining: 5 });
});
