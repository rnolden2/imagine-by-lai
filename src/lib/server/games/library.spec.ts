import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import type { RequestEvent } from '@sveltejs/kit';
import { curatedRecipes } from './curated';

const mocks = vi.hoisted(() => ({ db: null as SupabaseClient | null }));
vi.mock('$lib/server/db', () => ({ getSupabase: async () => mocks.db }));
vi.mock('./assets', () => ({ deliveryManifest: async () => ({}) }));
import { library } from './library';
import { startSession } from './sessions';
import { hash } from './common';

const originalFetch = globalThis.fetch;
const originalFixtureMode = process.env.WORD_KITCHEN_BROWSER_TEST;
let db: PGlite;
const deviceId = randomUUID();
const token = 'shared-library-test-device';
const parent = { locals: { user: { isAdmin: true } } } as RequestEvent;
const device = {
	locals: {},
	cookies: { get: () => token }
} as unknown as RequestEvent;
const shared = {
	...structuredClone(curatedRecipes[0]),
	recipeId: randomUUID(),
	revisionId: randomUUID(),
	title: 'Shared Garden Salad',
	gradeBand: { min: '6', max: '8' }
};
const draft = { ...shared, recipeId: randomUUID(), revisionId: randomUUID(), title: 'Draft Salad' };
const archived = {
	...shared,
	recipeId: randomUUID(),
	revisionId: randomUUID(),
	title: 'Archived Salad'
};

beforeAll(async () => {
	process.env.WORD_KITCHEN_BROWSER_TEST = '1';
	db = (await import('../../../../e2e/fixtures/word-kitchen-backend.mjs')).db;
	mocks.db = createClient('https://kitchen-tests.supabase.co', 'fixture-service-key');
	for (const recipe of [shared, draft, archived]) {
		await db.query(
			`insert into game_recipes(id,slug,child_id,origin) values($1,$2,1,'generated')`,
			[recipe.recipeId, recipe.title]
		);
		await db.query(
			`insert into game_recipe_revisions(id,recipe_id,revision,definition,checksum,status)
			 values($1,$2,1,$3,'fixture',$4)`,
			[
				recipe.revisionId,
				recipe.recipeId,
				JSON.stringify(recipe),
				recipe === draft ? 'ready_for_preview' : 'published'
			]
		);
		await db.query('update game_recipes set published_revision_id=$1,archived_at=$2 where id=$3', [
			recipe === draft ? null : recipe.revisionId,
			recipe === archived ? new Date().toISOString() : null,
			recipe.recipeId
		]);
	}
	await db.query(
		`insert into game_devices(id,child_ids,token_hash,expires_at) values($1,'{2}',$2,now()+interval '1 day')`,
		[deviceId, hash(token)]
	);
}, 30000);

afterAll(async () => {
	globalThis.fetch = originalFetch;
	if (originalFixtureMode === undefined) delete process.env.WORD_KITCHEN_BROWSER_TEST;
	else process.env.WORD_KITCHEN_BROWSER_TEST = originalFixtureMode;
	await db?.close();
});

it('shares generated recipes with every chef and exposes their grade guidance without assignments', async () => {
	const result = await library(parent);
	expect(result.cards.filter((card) => card.revisionId === shared.revisionId)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ childId: 1, gradeBand: { min: '6', max: '8' } }),
			expect.objectContaining({ childId: 2, gradeBand: { min: '6', max: '8' } })
		])
	);
	expect(
		result.cards.some((card) => [draft.revisionId, archived.revisionId].includes(card.revisionId))
	).toBe(false);
	expect((await db.query('select * from game_recipe_assignments')).rows).toHaveLength(0);
});

it('lets an unlocked kindergarten chef play another chef’s grade 6–8 recipe with their own learning words', async () => {
	const cards = await library(device);
	expect(cards.children.map((child) => Number(child.id))).toEqual([2]);
	expect(cards.cards.some((card) => card.revisionId === shared.revisionId)).toBe(true);
	const session = await startSession(device, 2, shared.revisionId, 5, randomUUID());
	expect(session.childId).toBe(2);
	const saved = await db.query<{ snapshot: { grade: string; selectedWords: { id: string }[] } }>(
		'select snapshot from game_sessions where id=$1',
		[session.id]
	);
	expect(saved.rows[0].snapshot.grade).toBe('K');
	expect(saved.rows[0].snapshot.selectedWords.every((word) => word.id.startsWith('grade:K:'))).toBe(
		true
	);
});

it('keeps drafts, archived recipes, parent previews and other child profiles protected', async () => {
	for (const revisionId of [draft.revisionId, archived.revisionId]) {
		await expect(startSession(device, 2, revisionId, 5, randomUUID())).rejects.toMatchObject({
			status: 409,
			body: { message: 'RECIPE_BLOCKED' }
		});
	}
	await expect(startSession(device, 1, shared.revisionId, 5, randomUUID())).rejects.toMatchObject({
		status: 404
	});
	await expect(
		startSession(device, 2, draft.revisionId, 5, randomUUID(), true)
	).rejects.toMatchObject({ status: 403 });
});

it('continues to apply the playing chef’s food exclusions to shared recipes', async () => {
	await db.query(`insert into game_child_settings(child_id,settings,revision) values(2,$1,1)`, [
		JSON.stringify({ excludedFoodConceptIds: [shared.ingredientConceptIds[0]] })
	]);
	try {
		expect(
			(await library(device)).cards.some((card) => card.revisionId === shared.revisionId)
		).toBe(false);
		await expect(startSession(device, 2, shared.revisionId, 5, randomUUID())).rejects.toMatchObject(
			{
				status: 409,
				body: { message: 'RECIPE_BLOCKED' }
			}
		);
	} finally {
		await db.query('delete from game_child_settings where child_id=2');
	}
});

it('loads the shared library past its first page', async () => {
	const recipes = Array.from({ length: 501 }, (_, index) => ({
		...shared,
		recipeId: randomUUID(),
		revisionId: randomUUID(),
		title: `Page fixture ${index}`
	}));
	await db.query(
		`insert into game_recipes(id,slug,origin)
		 select (r->>'recipeId')::uuid,r->>'title','generated' from jsonb_array_elements($1) r`,
		[JSON.stringify(recipes)]
	);
	await db.query(
		`insert into game_recipe_revisions(id,recipe_id,revision,definition,checksum,status)
		 select (r->>'revisionId')::uuid,(r->>'recipeId')::uuid,1,r,'fixture','published'
		 from jsonb_array_elements($1) r`,
		[JSON.stringify(recipes)]
	);
	await db.query(
		`update game_recipes set published_revision_id=(r->>'revisionId')::uuid
		 from jsonb_array_elements($1) r where id=(r->>'recipeId')::uuid`,
		[JSON.stringify(recipes)]
	);
	const cards = (await library(device)).cards.filter((card) =>
		card.title.startsWith('Page fixture ')
	);
	expect(cards).toHaveLength(501);
	expect(new Set(cards.map((card) => card.revisionId)).size).toBe(501);
}, 30000);
