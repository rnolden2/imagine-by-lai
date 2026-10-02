import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
// Local JavaScript fixture shared with the CLI and browser harness.
import { createTestDatabase } from '../../../../scripts/word-kitchen/test-db.mjs';
import { curatedRecipes } from './curated';
import { initialState } from '$lib/games/word-kitchen/engine';
let db: PGlite;
const recipe = curatedRecipes[0];
async function rpc<T = Record<string, unknown>>(name: string, args: unknown[]): Promise<T> {
	const row = await db.query<{ result: T }>(
		`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`,
		args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a))
	);
	return row.rows[0].result;
}
async function start(preview = false) {
	const id = randomUUID();
	const result = await rpc('wk_start_session', [
		id,
		1,
		recipe.revisionId,
		null,
		preview,
		randomUUID(),
		'request',
		{ grade: '1', recipe, steps: [], settings: {} },
		initialState(),
		0
	]);
	return { id, result };
}
beforeAll(async () => {
	db = await createTestDatabase();
	for (const r of curatedRecipes) {
		await db.query(`insert into game_recipes(id,slug,origin)values($1,$2,'curated')`, [
			r.recipeId,
			r.title
		]);
		await db.query(
			`insert into game_recipe_revisions(id,recipe_id,revision,definition,checksum,status)values($1,$2,1,$3,'hash','published')`,
			[r.revisionId, r.recipeId, JSON.stringify(r)]
		);
	}
}, 30000);
afterAll(async () => {
	await db?.close();
});
it('restricts every feature table and RPC to the server role', async () => {
	const result = await db.query<{ allowed: boolean }>(
		`select has_function_privilege('anon','wk_start_session(uuid,bigint,uuid,uuid,boolean,uuid,text,jsonb,jsonb,integer)','execute') allowed`
	);
	expect(result.rows[0].allowed).toBe(false);
	const tables = await db.query<{ rowsecurity: boolean }>(
		`select rowsecurity from pg_tables where tablename like 'game_%'or tablename like 'kitchen_%'`
	);
	expect(tables.rows.every((t) => t.rowsecurity)).toBe(true);
});
it('replays an exact start but rejects different data under the same key', async () => {
	const id = randomUUID(),
		key = randomUUID();
	const args = [
		id,
		1,
		recipe.revisionId,
		null,
		false,
		key,
		'same',
		{ grade: '1' },
		initialState(),
		0
	];
	const first = await rpc('wk_start_session', args);
	expect(await rpc('wk_start_session', [randomUUID(), ...args.slice(1)])).toEqual(first);
	const conflict = [...args];
	conflict[6] = 'different';
	await expect(rpc('wk_start_session', conflict)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});
it('commits attempts, spelling projection and exactly one reward with replay', async () => {
	const { id } = await start();
	const key = randomUUID();
	const state = { ...initialState(), sequence: 1, status: 'completed', points: 92 };
	const evidence = [
		{
			stepId: 's',
			submission: 1,
			word: 'cat',
			wordId: 'custom:1',
			wordSource: 'custom',
			skill: 'spelling',
			mechanic: 'word_spell',
			correct: true,
			assistance: 'independent',
			review: false,
			firstTry: true
		}
	];
	const args = [id, 1, key, 'hash', 0, 'submit_answer', state, evidence];
	const first = await rpc('wk_apply_event', args);
	expect(await rpc('wk_apply_event', args)).toEqual(first);
	expect(
		(await db.query(`select * from game_reward_ledger where session_id=$1`, [id])).rows
	).toHaveLength(1);
	expect(
		(await db.query(`select * from spelling_attempts where session_id=$1`, [id])).rows
	).toHaveLength(1);
	const conflict = [...args];
	conflict[3] = 'changed';
	await expect(rpc('wk_apply_event', conflict)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});
it('two concurrent sequence writers cannot both commit', async () => {
	const { id } = await start();
	const state = { ...initialState(), sequence: 1 };
	const result = await Promise.allSettled([
		rpc('wk_apply_event', [id, 1, randomUUID(), 'a', 0, 'pause', state, []]),
		rpc('wk_apply_event', [id, 1, randomUUID(), 'b', 0, 'pause', state, []])
	]);
	expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it('preview never writes learning records or rewards', async () => {
	const { id } = await start(true);
	await rpc('wk_apply_event', [
		id,
		1,
		randomUUID(),
		'hash',
		0,
		'complete_action',
		{ ...initialState(), sequence: 1, status: 'completed', points: 92 },
		[]
	]);
	expect(
		(await db.query(`select * from game_reward_ledger where session_id=$1`, [id])).rows
	).toHaveLength(0);
	expect(
		(await db.query(`select * from game_attempts where session_id=$1`, [id])).rows
	).toHaveLength(0);
});
it('history clearing atomically removes linked spelling attempts', async () => {
	await rpc('wk_clear_history', [1]);
	expect((await db.query('select * from game_sessions where child_id=1')).rows).toHaveLength(0);
	expect((await db.query('select * from spelling_attempts where child_id=1')).rows).toHaveLength(0);
	expect((await db.query('select * from game_reward_ledger where child_id=1')).rows).toHaveLength(
		0
	);
});
it('asset lease fencing rejects expired and superseded workers', async () => {
	const id = randomUUID();
	await db.exec(`insert into kitchen_concepts(id,kind,label)values('tool:test','tool','test')`);
	await db.query(
		`insert into kitchen_asset_identities(id,concept_id,state,style,view,contract)values($1,'tool:test','whole','v1','top','v1')`,
		[id]
	);
	const a = await rpc<{ lease_token: number }>('wk_claim_asset', [id]);
	expect(await rpc('wk_claim_asset', [id])).toBeNull();
	await db.query(
		`update kitchen_asset_identities set lease_expires_at=now()-interval '1 second'where id=$1`,
		[id]
	);
	const b = await rpc<{ lease_token: number }>('wk_claim_asset', [id]);
	expect(b.lease_token).toBe(a.lease_token + 1);
	await expect(
		rpc('wk_publish_asset', [id, a.lease_token, randomUUID(), {}, {}, []])
	).rejects.toThrow('STALE_LEASE');
});
it('serializes generation and reserves money once before paid calls', async () => {
	const id = randomUUID();
	const job = await rpc('wk_enqueue_job', [id, 1, randomUUID(), 'hash', {}, 5]);
	expect(job.id).toBe(id);
	await expect(
		rpc('wk_enqueue_job', [randomUUID(), 2, randomUUID(), 'other', {}, 5])
	).rejects.toThrow('GENERATION_BUSY');
	expect(await rpc('wk_reserve_cost', [id, 'logical-call', 0.3, 2, 5])).toBe(true);
	expect(await rpc('wk_reserve_cost', [id, 'logical-call', 0.3, 2, 5])).toBe(false);
	await expect(rpc('wk_reserve_cost', [id, 'overspend', 2, 2, 5])).rejects.toThrow(
		'BUDGET_EXCEEDED'
	);
	await rpc('wk_cancel_job', [id]);
	expect(await rpc('wk_claim_job', [id])).toBeNull();
});
it('preference changes invalidate an in-progress session', async () => {
	const { id } = await start();
	await rpc('wk_save_settings', [1, { excludedFoodConceptIds: ['dairy'] }, 0]);
	await expect(
		rpc('wk_apply_event', [
			id,
			1,
			randomUUID(),
			'hash',
			0,
			'pause',
			{ ...initialState(), sequence: 1 },
			[]
		])
	).rejects.toThrow('PREFERENCES_CHANGED');
	await expect(rpc('wk_save_settings', [1, {}, 0])).rejects.toThrow('STATE_CONFLICT');
});
