import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from '../../../scripts/word-kitchen/test-db.mjs';

let db: PGlite;
type Job = {
	id: string;
	kind: string;
	stage: string;
	status: string;
	lease_token: number;
	result_story_id: number | null;
	error_code: string | null;
	input: { profile: { name: string; grade: string } | null };
};
type Request = {
	key?: string;
	kind?: string;
	child?: number | null;
	story?: number | null;
	device?: string | null;
	input?: unknown;
};
const object = (name: string) => `imagine-by-lai/story-images/${name}.png`;
const content =
	'A brave child explored a forest and helped a lost friend find the way home. '.repeat(3);
async function value<T>(sql: string, args: unknown[] = []): Promise<T> {
	return (await db.query<{ result: T }>(sql, args)).rows[0].result;
}
async function enqueue(request: Request = {}) {
	return value<Job>('select app_enqueue_story_job($1,$2,$3,$4,$5,$6::jsonb) result', [
		request.key ?? randomUUID(),
		request.kind ?? 'create',
		request.child === undefined ? 1 : request.child,
		request.story ?? null,
		request.device ?? null,
		JSON.stringify(request.input ?? { prompt: 'Explore a friendly forest', themes: [] })
	]);
}
async function claim(job: Job) {
	return value<Job | null>('select app_claim_story_job($1) result', [job.id]);
}
async function state(job: Job) {
	return value<Job>('select to_jsonb(j) result from app_story_jobs j where id=$1', [job.id]);
}
async function reserve(job: Job, provider = 'openai') {
	return value<boolean>('select app_reserve_story_provider($1,$2,$3,$4) result', [
		job.id,
		job.lease_token,
		job.stage,
		provider
	]);
}
async function save(job: Job) {
	return value<boolean>('select app_save_story_text($1,$2,$3,$4) result', [
		job.id,
		job.lease_token,
		content,
		'A forest path with friendly woodland animals.'
	]);
}
async function finish(job: Job) {
	return value<boolean>('select app_finish_story_image($1,$2) result', [job.id, job.lease_token]);
}
async function cancel(job: Job, device: string | null = null) {
	return value<Job>('select app_cancel_story_job($1,$2) result', [job.id, device]);
}
async function expire(job: Job) {
	await db.query("update app_story_jobs set lease_until=now()-interval '1 second' where id=$1", [
		job.id
	]);
}
async function output(job: Job) {
	return value<string | null>('select app_story_output_for_upload($1,$2) result', [
		job.id,
		job.lease_token
	]);
}
async function cleanup() {
	await db.exec(
		"update app_story_image_cleanup set not_before=now()-interval '1 second',lease_until=null"
	);
	return value<{ object_name: string } | null>('select app_claim_story_image_cleanup() result');
}
async function story(image = object('existing')) {
	return value<number>(
		`insert into stories(child_id,prompt,content,grade_level,image_object_name)
		values(1,'Original idea',$1,'1',$2) returning id result`,
		[content, image]
	);
}
async function device(children = [1]) {
	const id = randomUUID();
	await db.query(
		`insert into game_devices(id,token_hash,child_ids,expires_at)
		values($1,$2,$3,now()+interval '1 day')`,
		[id, randomUUID(), children]
	);
	return id;
}
beforeAll(async () => {
	db = await createTestDatabase();
}, 30000);
beforeEach(async () => {
	await db.exec(`reset role;
		truncate app_story_requests cascade;
		delete from stories;
		truncate app_story_image_cleanup;
		delete from game_devices;`);
});
afterAll(async () => {
	await db?.close();
});

it('accepts one request/outbox and preserves the original profile snapshot across replay', async () => {
	const key = randomUUID();
	const jobs = await Promise.all(Array.from({ length: 5 }, () => enqueue({ key })));
	expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
	await db.exec("update child_profiles set name='Changed name' where id=1");
	expect((await enqueue({ key })).input.profile?.name).toBe('Alex');
	await expect(
		enqueue({ key, input: { prompt: 'A different forest adventure', themes: [] } })
	).rejects.toThrow('IDEMPOTENCY_CONFLICT');
	expect(await value('select count(*)::int result from app_story_requests')).toBe(1);
	expect(await value('select count(*)::int result from app_story_outbox')).toBe(1);
	await db.exec("update child_profiles set name='Alex' where id=1");
});

it.each([
	{ input: {} },
	{ input: { prompt: 'short' } },
	{ input: { prompt: 'x'.repeat(4001) } },
	{ input: { prompt: 'Explore a forest', themes: [123] } },
	{ input: { prompt: 'Explore a forest', themes: ['x'.repeat(201)] } },
	{ input: { prompt: 'Explore a forest', themes: Array(11).fill('forest') } },
	{ input: { prompt: 'Explore a forest', unexpected: true } },
	{ kind: 'unknown' },
	{ kind: 'from_image', child: null, input: { prompt: 'Idea', source_object: '../private.png' } }
])('rejects malformed requests atomically (%#)', async (request) => {
	await expect(enqueue(request)).rejects.toThrow();
	expect(await value('select count(*)::int result from app_story_requests')).toBe(0);
	expect(await value('select count(*)::int result from app_story_jobs')).toBe(0);
	expect(await value('select count(*)::int result from app_story_outbox')).toBe(0);
});

it('restricts child devices to new stories for allowed children and scopes idempotency by actor', async () => {
	const id = await device();
	const key = randomUUID();
	const own = await enqueue({ key, device: id });
	const parent = await enqueue({ key });
	expect(parent.id).not.toBe(own.id);
	await expect(enqueue({ device: id, child: 2 })).rejects.toThrow('STORY_ACCESS_DENIED');
	await expect(enqueue({ device: id, child: null })).rejects.toThrow('STORY_ACCESS_DENIED');
	await expect(
		enqueue({
			device: id,
			kind: 'from_image',
			child: null,
			input: { prompt: 'Idea', source_object: object('existing') }
		})
	).rejects.toThrow('STORY_ACCESS_DENIED');
	await expect(cancel(parent, id)).rejects.toThrow('STORY_ACCESS_DENIED');
	expect((await cancel(own, id)).status).toBe('cancelled');
});

it.each(['revoke', 'expire', 'delete'])(
	'cancels work when its authorizing device is invalidated: %s',
	async (change) => {
		const id = await device();
		const job = (await claim(await enqueue({ device: id })))!;
		if (change === 'delete') await db.query('delete from game_devices where id=$1', [id]);
		if (change === 'expire')
			await db.query("update game_devices set expires_at=now()-interval '1 second' where id=$1", [
				id
			]);
		if (change === 'revoke')
			await db.query('update game_devices set revoked_at=now() where id=$1', [id]);
		expect(await reserve(job)).toBe(false);
		expect(await save(job)).toBe(false);
		expect(await state(job)).toMatchObject({ status: 'cancelled', error_code: 'DEVICE_REVOKED' });
		expect(await value('select count(*)::int result from app_story_provider_attempts')).toBe(0);
		expect(await cleanup()).toMatchObject({ object_name: object(`jobs/${job.id}`) });
	}
);

it('fences duplicate and expired workers and saves a readable story before illustration work', async () => {
	const queued = await enqueue();
	const old = (await claim(queued))!;
	expect(await claim(queued)).toBeNull();
	await expire(old);
	const current = (await claim(queued))!;
	expect(current.lease_token).toBeGreaterThan(old.lease_token);
	expect(await save(old)).toBe(false);
	expect(await reserve(current)).toBe(true);
	expect(await save(current)).toBe(true);
	expect(await save(current)).toBe(false);
	const saved = await state(queued);
	expect(saved).toMatchObject({
		stage: 'image',
		status: 'queued',
		result_story_id: expect.any(Number)
	});
	expect(await value('select count(*)::int result from stories')).toBe(1);
	expect(
		await value('select content result from stories where id=$1', [saved.result_story_id])
	).toBe(content);
	expect(
		await value('select image_object_name result from stories where id=$1', [saved.result_story_id])
	).toBeNull();
	expect(await value('select count(*)::int result from app_story_outbox')).toBe(2);
});

it('retains readable text as partial success when illustration generation fails', async () => {
	const text = (await claim(await enqueue()))!;
	await reserve(text);
	await save(text);
	const image = (await claim(text))!;
	await reserve(image);
	expect(
		await value('select app_fail_story_job($1,$2,$3) result', [
			image.id,
			image.lease_token,
			'PROVIDER_FAILED'
		])
	).toBe(true);
	expect(await state(image)).toMatchObject({ status: 'partial', error_code: 'PROVIDER_FAILED' });
	expect(await value('select content result from stories')).toBe(content);
	expect(await output(image)).toBeNull();
	expect(await cleanup()).toMatchObject({ object_name: object(`jobs/${image.id}`) });
});

it('attaches a job-owned image atomically and keeps it out of cleanup while the story references it', async () => {
	const text = (await claim(await enqueue()))!;
	await save(text);
	const image = (await claim(text))!;
	expect(await output(image)).toBe(object(`jobs/${image.id}`));
	expect(await finish(image)).toBe(true);
	expect(await finish(image)).toBe(false);
	const complete = await state(image);
	expect(complete.status).toBe('succeeded');
	expect(
		await value('select image_object_name result from stories where id=$1', [
			complete.result_story_id
		])
	).toBe(object(`jobs/${image.id}`));
	expect(await cleanup()).toBeNull();
	await db.query('delete from stories where id=$1', [complete.result_story_id]);
	expect(await cleanup()).toMatchObject({ object_name: object(`jobs/${image.id}`) });
});

it('pins an image-to-story input after its source story is deleted and transfers the reference on success', async () => {
	const source = await story();
	const job = await enqueue({
		kind: 'from_image',
		child: null,
		input: { prompt: 'A story from this image', source_object: object('existing') }
	});
	await db.query('delete from stories where id=$1', [source]);
	expect(await cleanup()).toBeNull();
	await expect(
		db.query('select app_schedule_story_image_cleanup($1)', [object('existing')])
	).rejects.toThrow('IMAGE_STILL_REFERENCED');
	const working = (await claim(job))!;
	expect(await save(working)).toBe(true);
	expect(await state(job)).toMatchObject({
		status: 'succeeded',
		result_story_id: expect.any(Number)
	});
	expect(await value('select image_object_name result from stories')).toBe(object('existing'));
	expect(await value('select count(*)::int result from app_story_job_images')).toBe(0);
	expect(await cleanup()).toBeNull();
});

it('fences image inputs already claimed for deletion and rolls back their request admission', async () => {
	const source = await story();
	await db.query('delete from stories where id=$1', [source]);
	expect(await cleanup()).toMatchObject({ object_name: object('existing') });
	await expect(
		enqueue({
			kind: 'from_image',
			child: null,
			input: { prompt: 'A story from this image', source_object: object('existing') }
		})
	).rejects.toThrow('IMAGE_UNAVAILABLE');
	expect(await value('select count(*)::int result from app_story_requests')).toBe(0);
});

it('limits simultaneous regeneration and preserves a newer parent image assignment', async () => {
	const id = await story();
	const request = { kind: 'regenerate_image', child: null, story: id, input: {} };
	const job = await enqueue(request);
	await expect(enqueue(request)).rejects.toThrow('STORY_GENERATION_BUSY');
	const working = (await claim(job))!;
	await db.query('update stories set image_object_name=$1 where id=$2', [
		object('new-parent-image'),
		id
	]);
	expect(await finish(working)).toBe(false);
	expect(await state(job)).toMatchObject({ status: 'failed', error_code: 'STORY_CHANGED' });
	expect(await value('select image_object_name result from stories where id=$1', [id])).toBe(
		object('new-parent-image')
	);
	expect((await enqueue(request)).id).not.toBe(job.id);
});

it('replaces an unchanged story image and preserves its text', async () => {
	const id = await story();
	const working = (await claim(
		await enqueue({ kind: 'regenerate_image', child: null, story: id, input: {} })
	))!;
	expect(await finish(working)).toBe(true);
	expect(await value('select content result from stories where id=$1', [id])).toBe(content);
	expect(await value('select image_object_name result from stories where id=$1', [id])).toBe(
		object(`jobs/${working.id}`)
	);
	expect(await cleanup()).toMatchObject({ object_name: object('existing') });
});

it('does not recreate a story deleted while its illustration is pending', async () => {
	const working = (await claim(await enqueue()))!;
	await save(working);
	await db.query('delete from stories where id=$1', [(await state(working)).result_story_id]);
	expect(await claim(working)).toBeNull();
	expect(await state(working)).toMatchObject({ status: 'cancelled', error_code: 'STORY_DELETED' });
	expect(await value('select count(*)::int result from stories')).toBe(0);
	expect(await cleanup()).not.toBeNull();
});

it('retains admission and provider attempt receipts after child deletion without retaining prompt/profile data', async () => {
	const child = await value<number>(
		"insert into child_profiles(name,grade,gender) values('Temporary child','1','girl') returning id result"
	);
	const key = randomUUID();
	const working = (await claim(await enqueue({ key, child })))!;
	await reserve(working);
	await db.query('delete from child_profiles where id=$1', [child]);
	expect(await claim(working)).toBeNull();
	expect(await value('select count(*)::int result from app_story_jobs')).toBe(0);
	expect(await value('select count(*)::int result from app_story_provider_attempts')).toBe(1);
	expect(await value('select count(*)::int result from app_story_requests')).toBe(1);
	await expect(enqueue({ key, child })).rejects.toThrow('STORY_JOB_DELETED');
	expect(await cleanup()).toMatchObject({ object_name: object(`jobs/${working.id}`) });
});

it('reserves primary and fallback once per stage and prevents a new lease from buying an uncertain result again', async () => {
	const working = (await claim(await enqueue()))!;
	expect(await reserve(working)).toBe(true);
	await expect(reserve(working)).rejects.toThrow('UNCERTAIN_PROVIDER_RESULT');
	expect(await reserve(working, 'gemini')).toBe(true);
	await expire(working);
	const retry = (await claim(working))!;
	await expect(reserve(retry, 'gemini')).rejects.toThrow('UNCERTAIN_PROVIDER_RESULT');
	await expect(reserve(retry)).rejects.toThrow('UNCERTAIN_PROVIDER_RESULT');
	expect(await reserve(working)).toBe(false);
	expect(await value('select count(*)::int result from app_story_provider_attempts')).toBe(2);
});

it('does not buy a different provider after a crash between reservation and saving output', async () => {
	const working = (await claim(await enqueue()))!;
	await reserve(working);
	await expire(working);
	const retry = (await claim(working))!;
	await expect(reserve(retry, 'gemini')).rejects.toThrow('UNCERTAIN_PROVIDER_RESULT');
	expect(
		await value('select app_fail_story_job($1,$2,$3) result', [
			retry.id,
			retry.lease_token,
			'UNCERTAIN_PROVIDER_RESULT'
		])
	).toBe(true);
	expect((await state(working)).status).toBe('failed');
});

it('limits accepted starts across all workflows and does not refund them by deleting jobs', async () => {
	for (let i = 0; i < 10; i++) await enqueue();
	await db.exec('delete from app_story_jobs');
	await expect(enqueue()).rejects.toThrow('STORY_RATE_LIMIT');
	await db.exec("update app_story_requests set created_at=now()-interval '2 hours'");
	for (let i = 0; i < 10; i++) await enqueue();
	await db.exec("update app_story_requests set created_at=now()-interval '2 hours'");
	for (let i = 0; i < 10; i++) await enqueue();
	await db.exec("update app_story_requests set created_at=now()-interval '2 hours'");
	await expect(enqueue()).rejects.toThrow('STORY_RATE_LIMIT');
	await db.exec("update app_story_requests set created_at=now()-interval '25 hours'");
	expect((await enqueue()).status).toBe('queued');
});

it('enforces the global rolling provider-attempt allowance independently of surviving jobs', async () => {
	const working = (await claim(await enqueue()))!;
	await db.exec(`insert into app_story_requests(actor,request_key,input_hash)
		select 'fixture',gen_random_uuid(),repeat('a',64) from generate_series(1,30);
		insert into app_story_provider_attempts(job_id,stage,provider,lease_token)
		select id,stage,provider,1 from app_story_requests,
		unnest(array['text','image']) stage,unnest(array['openai','gemini']) provider where actor='fixture';`);
	await expect(reserve(working)).rejects.toThrow('BUDGET_EXCEEDED');
	await db.exec("update app_story_provider_attempts set created_at=now()-interval '25 hours'");
	expect(await reserve(working)).toBe(true);
});

it('recovers lost delivery and expired leases without duplicating pending outbox rows', async () => {
	const queued = await enqueue();
	await db.exec("update app_story_jobs set updated_at=now()-interval '11 minutes'");
	expect(await value('select app_reconcile_story_jobs() result')).toBe(0);
	await db.exec('update app_story_outbox set delivered_at=now()');
	expect(await value('select app_reconcile_story_jobs() result')).toBe(1);
	expect(await value('select count(*)::int result from app_story_outbox')).toBe(2);
	expect(await value('select app_reconcile_story_jobs() result')).toBe(0);
	const working = (await claim(queued))!;
	await expire(working);
	expect(await value('select app_reconcile_story_jobs() result')).toBe(1);
	expect(await save(working)).toBe(false);
	expect((await claim(queued))!.lease_token).toBeGreaterThan(working.lease_token);
});

it('bounds repeated worker crashes and releases image pins for expired jobs', async () => {
	const job = await enqueue();
	for (let i = 0; i < 3; i++) await expire((await claim(job))!);
	expect(await claim(job)).toBeNull();
	expect(await state(job)).toMatchObject({ status: 'failed', error_code: 'ATTEMPTS_EXHAUSTED' });
	const expired = await enqueue();
	await db.query(
		"update app_story_jobs set created_at=now()-interval '25 hours',updated_at=now()-interval '25 hours' where id=$1",
		[expired.id]
	);
	await value('select app_reconcile_story_jobs() result');
	expect(await state(expired)).toMatchObject({ status: 'cancelled', error_code: 'JOB_EXPIRED' });
	expect(await value('select count(*)::int result from app_story_job_images')).toBe(0);
});

it('rejects stale checkpoints and provider work after cancellation while retaining completed text', async () => {
	const text = (await claim(await enqueue()))!;
	await save(text);
	const image = (await claim(text))!;
	expect((await cancel(image)).status).toBe('cancelled');
	expect(await finish(image)).toBe(false);
	expect(await reserve(image)).toBe(false);
	expect(await output(image)).toBeNull();
	expect(await value('select content result from stories')).toBe(content);
});

it('restricts tables and every new RPC to the service role and supports the service-role happy path', async () => {
	const tables = await db.query<{ rowsecurity: boolean; allowed: boolean; service: boolean }>(`
		select rowsecurity,
		  has_table_privilege('anon','public.'||tablename,'select,insert,update,delete') or
		  has_table_privilege('authenticated','public.'||tablename,'select,insert,update,delete') allowed,
		  has_table_privilege('service_role','public.'||tablename,'select,insert,update,delete') service
		from pg_tables where schemaname='public' and tablename in
		('app_story_requests','app_story_jobs','app_story_outbox','app_story_provider_attempts','app_story_job_images')`);
	expect(tables.rows).toHaveLength(5);
	expect(tables.rows.every((table) => table.rowsecurity && !table.allowed && table.service)).toBe(
		true
	);
	for (const role of ['anon', 'authenticated']) {
		await db.exec(`set role ${role}`);
		await expect(enqueue()).rejects.toMatchObject({ code: '42501' });
		await expect(db.exec('select * from app_story_jobs')).rejects.toMatchObject({ code: '42501' });
		await db.exec('reset role');
	}
	const procedures = await db.query<{ name: string; definer: boolean; allowed: boolean }>(`
		select proname name,prosecdef definer,has_function_privilege('anon',oid,'execute') allowed
		from pg_proc where pronamespace='public'::regnamespace and
		(proname like 'app_%story_job%' or proname in ('app_reserve_story_provider','app_save_story_text','app_story_output_for_upload','app_finish_story_image'))`);
	expect(procedures.rows.length).toBeGreaterThanOrEqual(12);
	expect(procedures.rows.every((row) => !row.definer && !row.allowed)).toBe(true);
	await db.exec('set role service_role');
	const text = (await claim(await enqueue()))!;
	expect(await reserve(text)).toBe(true);
	expect(await save(text)).toBe(true);
	const image = (await claim(text))!;
	expect(await finish(image)).toBe(true);
	await db.exec('reset role');
});
