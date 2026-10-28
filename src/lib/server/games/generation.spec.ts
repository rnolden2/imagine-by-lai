import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { curatedInputs } from './curated';
const mocks = vi.hoisted(() => ({
	config: {
		WORD_KITCHEN_TASK_QUEUE: 'projects/test/locations/test/queues/test',
		WORD_KITCHEN_WORKER_URL: 'https://worker.test',
		WORD_KITCHEN_WORKER_SERVICE_ACCOUNT: 'test@example.iam.gserviceaccount.com'
	} as Record<string, string>,
	plan: vi.fn(),
	image: vi.fn(),
	publish: vi.fn(),
	db: null as SupabaseClient | null
}));
vi.mock('#lib/server/runtime-config', () => ({
	env: mocks.config
}));
vi.mock('#lib/server/db', () => ({ getSupabase: async () => mocks.db }));
vi.mock('#lib/server/ai', () => ({ generateGamePlan: mocks.plan, generateGameImage: mocks.image }));
vi.mock('./assets', () => ({ publishGeneratedAsset: mocks.publish, deliveryManifest: vi.fn() }));
import {
	assetIdentity,
	classifyGenerationFailure,
	enqueueGeneration,
	runGeneration
} from './generation';
import { safeGameEventError } from './sessions';
const originalFetch = globalThis.fetch;
let database: PGlite;
let favoriteId: string;
const input = curatedInputs[1];
const generatedPlan = {
	supported: true,
	reason: '',
	title: 'My Pancakes',
	description: 'Make a pretend stack and practice your words.',
	ingredients: [
		{ label: 'flour', canonicalId: 'ingredient:flour', tags: ['wheat'] },
		{ label: 'milk', canonicalId: 'ingredient:milk', tags: ['dairy'] },
		{ label: 'egg', canonicalId: 'ingredient:egg', tags: ['egg'] }
	],
	vocabulary: input.vocabulary,
	actions: input.actions
};
beforeAll(async () => {
	process.env.WORD_KITCHEN_BROWSER_TEST = '1';
	const fixture = await import('../../../../e2e/fixtures/word-kitchen-backend.mjs');
	database = fixture.db;
	mocks.db = createClient('https://kitchen-tests.supabase.co', 'fixture-only-server-key', {
		auth: { persistSession: false }
	});
}, 30000);
beforeEach(async () => {
	await database.exec('BEGIN');
	favoriteId = randomUUID();
	await database.query(
		"insert into game_favorite_foods(id,child_id,display_name,normalized_name) values($1,1,'Pancakes','pancakes')",
		[favoriteId]
	);
	vi.clearAllMocks();
	mocks.plan.mockResolvedValue(structuredClone(generatedPlan));
	mocks.image.mockResolvedValue(Buffer.from('test-image'));
	mocks.publish.mockImplementation(async (identity: string, token: number) => {
		const id = randomUUID();
		const result = await mocks.db!.rpc('wk_publish_asset', {
			p_identity: identity,
			p_token: token,
			p_revision: id,
			p_metadata: { fixture: true },
			p_report: { valid: true },
			p_variants: []
		});
		if (result.error) throw new Error(result.error.message);
		return id;
	});
});
afterEach(async () => {
	await database.exec('ROLLBACK');
});
afterAll(async () => {
	globalThis.fetch = originalFetch;
	delete process.env.WORD_KITCHEN_BROWSER_TEST;
	await database?.close();
});

it('maps provider and database failures to a closed set of safe diagnostic codes', () => {
	expect(
		classifyGenerationFailure({
			body: { message: 'private provider detail containing BUDGET_EXCEEDED and a child prompt' }
		})
	).toEqual({ code: 'BUDGET_EXCEEDED', terminal: true, needsParent: false });
	expect(classifyGenerationFailure({ code: 'insufficient_quota' })).toEqual({
		code: 'PROVIDER_CREDITS_EXHAUSTED',
		terminal: true,
		needsParent: false
	});
	expect(classifyGenerationFailure(new Error('private provider response'))).toEqual({
		code: 'GENERATION_FAILED',
		terminal: false,
		needsParent: false
	});
	expect(classifyGenerationFailure(new Error('RECIPE_BLOCKED'))).toEqual({
		code: 'RECIPE_BLOCKED',
		terminal: true,
		needsParent: true
	});
});

it('keeps unexpected game-engine exception details out of client responses', () => {
	expect(safeGameEventError(new Error('STATE_CONFLICT'))).toBe('STATE_CONFLICT');
	expect(safeGameEventError(new Error('private child answer and database detail'))).toBe(
		'INVALID_EVENT'
	);
});
it('runs persisted stages, reuses shared assets, fences duplicate workers, and approves an exact revision', async () => {
	const key = randomUUID();
	const job = await enqueueGeneration(1, favoriteId, key);
	expect((await enqueueGeneration(1, favoriteId, key)).id).toBe(job.id);
	let status = 'queued';
	for (
		let i = 0;
		i < 40 && !['failed', 'needs_parent_input', 'ready_for_preview'].includes(status);
		i++
	) {
		await Promise.all([runGeneration(job.id), runGeneration(job.id)]);
		const result = await mocks
			.db!.from('game_generation_jobs')
			.select('*')
			.eq('id', job.id)
			.single();
		expect(result.error).toBeNull();
		status = result.data!.status;
	}
	expect(status).toBe('ready_for_preview');
	expect(mocks.plan).toHaveBeenCalledTimes(1);
	expect(mocks.image).toHaveBeenCalledTimes(1);
	expect(mocks.publish).toHaveBeenCalledTimes(1);
	const draft = (
		await mocks
			.db!.from('game_recipe_revisions')
			.select('*')
			.eq('status', 'ready_for_preview')
			.single()
	).data!;
	// An expected SQL exception must not abort the outer test-isolation transaction.
	await database.exec('SAVEPOINT invalid_approval');
	const bad = await mocks.db!.rpc('wk_approve_recipe', {
		p_revision: draft.id,
		p_checksum: 'changed',
		p_child: 1,
		p_preferences: 0
	});
	expect(bad.error?.message).toContain('REVISION_CHANGED');
	await database.exec('ROLLBACK TO SAVEPOINT invalid_approval');
	const approved = await mocks.db!.rpc('wk_approve_recipe', {
		p_revision: draft.id,
		p_checksum: draft.checksum,
		p_child: 1,
		p_preferences: 0
	});
	expect(approved.error).toBeNull();
	expect(
		(await mocks.db!.from('game_recipe_assignments').select('*').eq('child_id', 1)).data
	).toHaveLength(1);
});
it('cancelling before dispatch performs no provider calls', async () => {
	const job = await enqueueGeneration(1, favoriteId, randomUUID());
	await mocks.db!.rpc('wk_cancel_job', { p_id: job.id });
	await runGeneration(job.id);
	expect(mocks.plan).not.toHaveBeenCalled();
	expect(mocks.image).not.toHaveBeenCalled();
	expect(mocks.publish).not.toHaveBeenCalled();
	expect(
		(await mocks.db!.from('game_generation_jobs').select('status').eq('id', job.id).single()).data
			?.status
	).toBe('cancelled');
});

it('reserves fallback spending and records Gemini asset provenance', async () => {
	mocks.plan.mockImplementation(async (_prompt, _schema, options) => {
		await options.beforeFallback();
		return structuredClone(generatedPlan);
	});
	mocks.image.mockImplementation(async (_prompt, _transparent, options) => {
		await options.beforeFallback();
		options.onProvider('gemini');
		return Buffer.from('test-image');
	});
	const job = await enqueueGeneration(1, favoriteId, randomUUID());
	let status = 'queued';
	for (
		let i = 0;
		i < 40 && !['failed', 'needs_parent_input', 'ready_for_preview'].includes(status);
		i++
	) {
		await runGeneration(job.id);
		const result = await mocks
			.db!.from('game_generation_jobs')
			.select('*')
			.eq('id', job.id)
			.single();
		status = result.data!.status;
	}
	expect(status).toBe('ready_for_preview');
	const costs = await database.query<{ logical_key: string }>(
		'select logical_key from game_cost_reservations where job_id=$1',
		[job.id]
	);
	expect(costs.rows.filter((row) => row.logical_key.endsWith(':gemini'))).toHaveLength(2);
	expect(mocks.publish).toHaveBeenLastCalledWith(
		expect.any(String),
		expect.any(Number),
		expect.any(Buffer),
		{ jobId: job.id, provider: 'gemini' },
		false
	);
});

it('rejects missing shared content before creating a job or reserving provider spending', async () => {
	const beforeJobs = await database.query('select id from game_generation_jobs order by id');
	const beforeCosts = await database.query('select id from game_cost_reservations order by id');
	const planCalls = mocks.plan.mock.calls.length;
	const fixtureFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/kitchen_concepts'))
			return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
		return fixtureFetch(input, init);
	};
	try {
		await expect(enqueueGeneration(1, favoriteId, randomUUID())).rejects.toMatchObject({
			status: 503,
			body: { message: expect.stringContaining('starter content is missing') }
		});
	} finally {
		globalThis.fetch = fixtureFetch;
	}
	expect((await database.query('select id from game_generation_jobs order by id')).rows).toEqual(
		beforeJobs.rows
	);
	expect((await database.query('select id from game_cost_reservations order by id')).rows).toEqual(
		beforeCosts.rows
	);
	expect(mocks.plan).toHaveBeenCalledTimes(planCalls);
});

it('reports a missing asset concept explicitly without a foreign-key write', async () => {
	await expect(assetIdentity('tool:not-installed')).rejects.toThrow('MISSING_ASSET_CONCEPT');
	expect(
		(
			await database.query(
				"select id from kitchen_asset_identities where concept_id='tool:not-installed'"
			)
		).rows
	).toEqual([]);
});

it.each(['GAMES_ENABLED', 'WORD_KITCHEN_ENABLED', 'WORD_KITCHEN_GENERATION_ENABLED'])(
	'%s prevents admission and worker claims without consuming spending or provider calls',
	async (flag) => {
		mocks.config[flag] = 'false';
		const rpc = vi.spyOn(mocks.db!, 'rpc');
		const before = await database.query('select id from game_generation_jobs');
		try {
			await expect(enqueueGeneration(1, favoriteId, randomUUID())).rejects.toMatchObject({
				status: 503
			});
			await expect(runGeneration(randomUUID())).rejects.toMatchObject({ status: 503 });
			expect(rpc).not.toHaveBeenCalled();
			expect(mocks.plan).not.toHaveBeenCalled();
			expect(mocks.image).not.toHaveBeenCalled();
			expect((await database.query('select id from game_generation_jobs')).rows).toEqual(
				before.rows
			);
		} finally {
			delete mocks.config[flag];
			rpc.mockRestore();
		}
	}
);
