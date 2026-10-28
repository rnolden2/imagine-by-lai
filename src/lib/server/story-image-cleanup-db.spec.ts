import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from '../../../scripts/word-kitchen/test-db.mjs';

let db: PGlite;
const object = (name: string) => `imagine-by-lai/story-images/${name}.png`;
type Claim = { object_name: string; lease_token: number; generation: string | null };
async function story(name: string, child = 1) {
	return (
		await db.query<{ id: number }>(
			`insert into stories(child_id,prompt,content,grade_level,image_object_name,image_url)
		values($1,'Idea','Story','1',$2,'https://fixture.invalid/image.png') returning id`,
			[child, object(name)]
		)
	).rows[0].id;
}
async function due() {
	await db.exec(
		"update app_story_image_cleanup set not_before=now()-interval '1 second',lease_until=null where state<>'deleted'"
	);
}
async function claim() {
	return (await db.query<{ result: Claim | null }>('select app_claim_story_image_cleanup() result'))
		.rows[0].result;
}
async function finish(item: Claim, error: string | null = null) {
	return (
		await db.query<{ result: boolean }>('select app_finish_story_image_cleanup($1,$2,$3) result', [
			item.object_name,
			item.lease_token,
			error
		])
	).rows[0].result;
}
beforeAll(async () => {
	db = await createTestDatabase();
}, 30000);
afterAll(async () => {
	await db?.close();
});

it('keeps a shared image while another story references it', async () => {
	const first = await story('shared');
	const second = await story('shared');
	await db.query('delete from stories where id=$1', [first]);
	await due();
	expect(await claim()).toBeNull();
	expect((await db.query('select id from stories where id=$1', [second])).rows).toHaveLength(1);
	expect((await db.query('select object_name from app_story_image_cleanup')).rows).toHaveLength(0);
});
it('waits an hour and cancels queued cleanup when an image is reassigned', async () => {
	const original = await story('reassigned');
	await db.query('delete from stories where id=$1', [original]);
	expect(await claim()).toBeNull();
	await story('reassigned');
	await due();
	expect(await claim()).toBeNull();
});
it('fences references after claiming and retains deletion tombstones across lost acknowledgements', async () => {
	const original = await story('fenced');
	await db.query('delete from stories where id=$1', [original]);
	await due();
	const item = (await claim())!;
	expect(item.object_name).toBe(object('fenced'));
	await expect(story('fenced')).rejects.toThrow('IMAGE_UNAVAILABLE');
	expect(await finish(item)).toBe(true);
	expect(await finish(item)).toBe(false);
	await expect(story('fenced')).rejects.toThrow('IMAGE_UNAVAILABLE');
	expect(await claim()).toBeNull();
});
it('queues child cascades atomically and rolls cleanup back with a failed transaction', async () => {
	const child = (
		await db.query<{ id: number }>(
			"insert into child_profiles(name,gender,grade) values('Cleanup fixture','boy','1') returning id"
		)
	).rows[0].id;
	await story('cascade', child);
	await db.exec('begin');
	await db.query('delete from child_profiles where id=$1', [child]);
	await db.exec('rollback');
	expect(
		(
			await db.query('select object_name from app_story_image_cleanup where object_name=$1', [
				object('cascade')
			])
		).rows
	).toHaveLength(0);
	await db.query('delete from child_profiles where id=$1', [child]);
	await due();
	const item = (await claim())!;
	expect(item.object_name).toBe(object('cascade'));
	await finish(item);
});
it('preserves the first GCS generation on retry and ignores stale-worker acknowledgements', async () => {
	const id = await story('generation');
	await db.query('delete from stories where id=$1', [id]);
	await due();
	const first = (await claim())!;
	await db.query('select app_bind_story_image_generation($1,$2,$3)', [
		first.object_name,
		first.lease_token,
		'100'
	]);
	await due();
	const next = (await claim())!;
	expect(next.generation).toBe('100');
	expect(Number(next.lease_token)).toBeGreaterThan(Number(first.lease_token));
	expect(
		(
			await db.query<{ result: string }>(
				'select app_bind_story_image_generation($1,$2,$3) result',
				[next.object_name, next.lease_token, '200']
			)
		).rows[0].result
	).toBe('100');
	expect(await finish(first)).toBe(false);
	expect(await finish(next, 'GENERATION_CONFLICT')).toBe(true);
	expect(await claim()).toBeNull();
	await due();
	const retry = (await claim())!;
	expect(retry.generation).toBe('100');
	await finish(retry);
});
it('blocks unsafe cleanup until legacy references have been normalized', async () => {
	await db.exec('alter table stories disable trigger app_story_image_guard');
	const legacy = (
		await db.query<{ id: number }>(`insert into stories(prompt,content,grade_level,image_url)
		values('Legacy','Story','1','https://fixture.invalid/legacy.png') returning id`)
	).rows[0].id;
	await db.exec('alter table stories enable trigger app_story_image_guard');
	await expect(db.query('delete from stories where id=$1', [legacy])).rejects.toThrow(
		'IMAGE_MIGRATION_REQUIRED'
	);
	const id = await story('blocked-by-legacy');
	await db.query('delete from stories where id=$1', [id]);
	await due();
	expect(await claim()).toBeNull();
	await db.query('update stories set image_object_name=$1 where id=$2', [object('legacy'), legacy]);
	const item = (await claim())!;
	expect(item.object_name).toBe(object('blocked-by-legacy'));
	await finish(item);
});
it('reserves orphan cleanup before upload and disallows public queue access', async () => {
	await db.query('select app_schedule_story_image_cleanup($1)', [object('orphan')]);
	await story('orphan');
	expect(
		(
			await db.query('select object_name from app_story_image_cleanup where object_name=$1', [
				object('orphan')
			])
		).rows
	).toHaveLength(0);
	await expect(
		db.query('select app_schedule_story_image_cleanup($1)', [object('orphan')])
	).rejects.toThrow('IMAGE_STILL_REFERENCED');
	await expect(
		db.query('select app_schedule_story_image_cleanup($1)', ['private.png'])
	).rejects.toMatchObject({ code: '23514' });
	await db.exec('set role anon');
	await expect(claim()).rejects.toMatchObject({ code: '42501' });
	await expect(db.exec('select * from app_story_image_cleanup')).rejects.toMatchObject({
		code: '42501'
	});
	await db.exec('reset role');
});
it('lets an administrator clear an unsupported legacy URL without deleting an unrelated object', async () => {
	await db.exec('alter table stories disable trigger app_story_image_guard');
	const legacy = (
		await db.query<{ id: number }>(`insert into stories(prompt,content,grade_level,image_url)
		values('Unsupported legacy','Story','1','https://untrusted.invalid/image.png') returning id`)
	).rows[0].id;
	await db.exec('alter table stories enable trigger app_story_image_guard');
	await db.query('update stories set image_url=null where id=$1', [legacy]);
	await db.query('delete from stories where id=$1', [legacy]);
	expect((await db.query('select id from stories where id=$1', [legacy])).rows).toHaveLength(0);
	expect(
		(await db.query("select object_name from app_story_image_cleanup where state='queued'")).rows
	).toHaveLength(0);
});
