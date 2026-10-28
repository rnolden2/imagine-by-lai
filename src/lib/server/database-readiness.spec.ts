import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import { createTestDatabase } from '../../../scripts/word-kitchen/test-db.mjs';

let db: PGlite;
const tables = [
	'child_profiles',
	'lessons',
	'stories',
	'math_settings',
	'math_attempts',
	'spelling_words',
	'spelling_attempts'
];
beforeAll(async () => {
	db = await createTestDatabase();
}, 30000);
afterAll(async () => {
	await db?.close();
});

it('bootstraps and migrates every application table with private grants and RLS', async () => {
	const result = await db.query<{
		tablename: string;
		rowsecurity: boolean;
		anon_select: boolean;
		anon_insert: boolean;
		anon_update: boolean;
		anon_delete: boolean;
		authenticated_select: boolean;
		authenticated_insert: boolean;
		authenticated_update: boolean;
		authenticated_delete: boolean;
	}>(`
		select tablename, rowsecurity,
			has_table_privilege('anon', format('public.%I',tablename), 'select') anon_select,
			has_table_privilege('anon', format('public.%I',tablename), 'insert') anon_insert,
			has_table_privilege('anon', format('public.%I',tablename), 'update') anon_update,
			has_table_privilege('anon', format('public.%I',tablename), 'delete') anon_delete,
			has_table_privilege('authenticated', format('public.%I',tablename), 'select') authenticated_select,
			has_table_privilege('authenticated', format('public.%I',tablename), 'insert') authenticated_insert,
			has_table_privilege('authenticated', format('public.%I',tablename), 'update') authenticated_update,
			has_table_privilege('authenticated', format('public.%I',tablename), 'delete') authenticated_delete
		from pg_tables where schemaname='public'
	`);
	expect(result.rows.length).toBeGreaterThan(tables.length);
	for (const table of result.rows)
		expect(table).toMatchObject({
			rowsecurity: true,
			anon_select: false,
			anon_insert: false,
			anon_update: false,
			anon_delete: false,
			authenticated_select: false,
			authenticated_insert: false,
			authenticated_update: false,
			authenticated_delete: false
		});
	for (const table of tables) expect(result.rows.some((r) => r.tablename === table)).toBe(true);
	expect(result.rows.some((r) => r.tablename === 'science_experiments')).toBe(true);
	expect(result.rows.some((r) => r.tablename === 'game_sessions')).toBe(true);
});
it('keeps every public application sequence and function server-only', async () => {
	const sequences = await db.query<{
		sequencename: string;
		anon_usage: boolean;
		anon_select: boolean;
		anon_update: boolean;
		authenticated_usage: boolean;
		authenticated_select: boolean;
		authenticated_update: boolean;
	}>(`
		select sequencename,
			has_sequence_privilege('anon',format('public.%I',sequencename),'usage') anon_usage,
			has_sequence_privilege('anon',format('public.%I',sequencename),'select') anon_select,
			has_sequence_privilege('anon',format('public.%I',sequencename),'update') anon_update,
			has_sequence_privilege('authenticated',format('public.%I',sequencename),'usage') authenticated_usage,
			has_sequence_privilege('authenticated',format('public.%I',sequencename),'select') authenticated_select,
			has_sequence_privilege('authenticated',format('public.%I',sequencename),'update') authenticated_update
		from pg_sequences where schemaname='public'
	`);
	expect(sequences.rows.length).toBeGreaterThan(0);
	for (const sequence of sequences.rows)
		expect(sequence).toMatchObject({
			anon_usage: false,
			anon_select: false,
			anon_update: false,
			authenticated_usage: false,
			authenticated_select: false,
			authenticated_update: false
		});

	const functions = await db.query<{
		name: string;
		security_definer: boolean;
		settings: string;
		anon_execute: boolean;
		authenticated_execute: boolean;
		service_execute: boolean;
	}>(`
		select p.oid::regprocedure::text name,
			p.prosecdef security_definer,
			coalesce(array_to_string(p.proconfig,','),'') settings,
			has_function_privilege('anon',p.oid,'execute') anon_execute,
			has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
			has_function_privilege('service_role',p.oid,'execute') service_execute
		from pg_proc p
		join pg_namespace n on n.oid=p.pronamespace
		where n.nspname='public'
		order by name
	`);
	expect(functions.rows.length).toBeGreaterThan(0);
	for (const fn of functions.rows) {
		expect(fn, fn.name).toMatchObject({
			security_definer: false,
			anon_execute: false,
			authenticated_execute: false,
			service_execute: true
		});
		expect(fn.settings, fn.name).toContain('search_path=');
	}
});
it('allows the service role to allocate IDs but rejects direct client access', async () => {
	await db.exec('set role anon');
	await expect(db.query('select * from child_profiles')).rejects.toMatchObject({ code: '42501' });
	await db.exec('reset role');
	await db.exec('set role service_role');
	const row = await db.query<{ id: number }>(
		`insert into child_profiles(name,grade,gender) values('Fixture','2','girl') returning id`
	);
	expect(row.rows[0].id).toBeGreaterThan(2);
	await db.exec('reset role');
});
it('validates new profile, math, and spelling writes at the database boundary', async () => {
	await expect(
		db.exec(`insert into child_profiles(name,grade,gender) values('','1','boy')`)
	).rejects.toMatchObject({ code: '23514' });
	await expect(
		db.exec(`insert into math_settings(child_id,operations) values(1,'{unsupported}')`)
	).rejects.toMatchObject({ code: '23514' });
	await expect(
		db.exec(`insert into spelling_words(word,grade) values('cat','99')`)
	).rejects.toMatchObject({ code: '23514' });
	await expect(
		db.exec(`insert into math_attempts(child_id,session_id,operation,problem_state,correct_answer,given_answer,is_correct)
		values(1,'session','addition','{"num1":1,"num2":1}','2','3',true)`)
	).rejects.toMatchObject({ code: '23514' });
});
it('deletes child-owned stories and history instead of making them shared', async () => {
	const {
		rows: [child]
	} = await db.query<{ id: number }>(
		`insert into child_profiles(name,grade,gender) values('Delete Fixture','1','boy') returning id`
	);
	await db.query(
		`insert into stories(child_id,prompt,content,grade_level) values($1,'Idea','Personal story','1')`,
		[child.id]
	);
	await db.query(
		`insert into spelling_attempts(child_id,session_id,word,grade,attempts_used,is_correct) values($1,'session','cat','1',1,true)`,
		[child.id]
	);
	await db.query('delete from child_profiles where id=$1', [child.id]);
	expect(
		(await db.query(`select id from stories where content='Personal story'`)).rows
	).toHaveLength(0);
	expect(
		(await db.query(`select id from spelling_attempts where session_id='session'`)).rows
	).toHaveLength(0);
});
it('refuses to bootstrap over an existing installation without changing its rows', async () => {
	await expect(db.exec(await fs.readFile('supabase/bootstrap.sql', 'utf8'))).rejects.toThrow(
		'Bootstrap requires an empty'
	);
	await db.exec('rollback');
	expect((await db.query('select id from child_profiles where id=1')).rows).toHaveLength(1);
});
it('can validate all new constraints on a fresh installation', async () => {
	const constraints = await db.query<{ tablename: string; conname: string }>(`
		select c.conrelid::regclass::text tablename,c.conname from pg_constraint c
		where c.conname like 'app_%' and not c.convalidated
	`);
	expect(constraints.rows.length).toBeGreaterThan(5);
	for (const { tablename, conname } of constraints.rows)
		await db.exec(`alter table ${tablename} validate constraint ${conname}`);
	expect(
		(await db.query(`select 1 from pg_constraint where conname like 'app_%' and not convalidated`))
			.rows
	).toHaveLength(0);
});
it('indexes every foreign-key column for bounded joins and cascades', async () => {
	const missing = await db.query<{
		tablename: string;
		constraint_name: string;
		column_name: string;
	}>(`
		select c.conrelid::regclass::text tablename,
			c.conname constraint_name,
			a.attname column_name
		from pg_constraint c
		cross join lateral unnest(c.conkey) key(attnum)
		join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum
		where c.contype='f'
			and c.connamespace='public'::regnamespace
			and not exists (
				select 1 from pg_index i
				where i.indrelid=c.conrelid
					and i.indisvalid
					and i.indkey[0]=key.attnum
			)
		order by 1,2,3
	`);
	expect(missing.rows).toEqual([]);
});
it('returns complete bounded-dashboard catalog counts through a private RPC', async () => {
	await db.exec("insert into lessons(lesson) values('Count fixture')");
	await db.exec("insert into spelling_words(word,grade) values('counting','1')");
	const counts = (
		await db.query<{
			counts: { storyCount: number; lessonCount: number; spellingWordCount: number };
		}>('select app_admin_catalog_counts() counts')
	).rows[0].counts;
	expect(counts).toMatchObject({ storyCount: expect.any(Number) });
	expect(counts.lessonCount).toBeGreaterThanOrEqual(1);
	expect(counts.spellingWordCount).toBeGreaterThanOrEqual(1);
	for (const role of ['anon', 'authenticated']) {
		expect(
			(
				await db.query<{ allowed: boolean }>(
					`select has_function_privilege($1,'app_admin_catalog_counts()','execute') allowed`,
					[role]
				)
			).rows[0].allowed
		).toBe(false);
	}
});
