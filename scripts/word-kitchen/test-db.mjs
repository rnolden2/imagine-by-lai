import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function createTestDatabase() {
	const db = new PGlite();
	await initializeTestDatabase(db);
	return db;
}

// Shared by the embedded fixtures and disposable native PostgreSQL race tests.
/** @param {{ exec: (sql: string) => Promise<unknown> }} db */
export async function initializeTestDatabase(db) {
	await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
	await db.exec(await fs.readFile('supabase/bootstrap.sql', 'utf8'));
	await db.exec(
		`insert into child_profiles(name,grade,gender)values('Alex','1','boy'),('Sam','K','girl');`
	);
	const files = (await fs.readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
	for (const file of files) await db.exec(await fs.readFile(`supabase/migrations/${file}`, 'utf8'));
}

if (process.argv[1]?.endsWith('test-db.mjs')) {
	const db = await createTestDatabase();
	const result = await db.query(
		`select tablename,rowsecurity from pg_tables where schemaname='public'and(tablename like 'game_%'or tablename like 'kitchen_%')`
	);
	assert(result.rows.length >= 20);
	assert(result.rows.every((r) => r.rowsecurity));
	for (const role of ['anon', 'authenticated']) {
		const grants = await db.query(
			`select has_table_privilege($1,'public.game_sessions','select') allowed, has_function_privilege($1,'public.wk_clear_history(bigint)','execute') rpc`,
			[role]
		);
		assert.equal(grants.rows[0].allowed, false);
		assert.equal(grants.rows[0].rpc, false);
	}
	console.log(
		`Migration applied to embedded PostgreSQL; ${result.rows.length} feature tables have RLS; client access and privileged RPC access are denied.`
	);
	await db.close();
}
