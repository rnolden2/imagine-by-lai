// Test-only PostgREST transport backed by real embedded PostgreSQL and the production migration.
// Loaded explicitly by Playwright; never imported by application code.
import fs from 'node:fs/promises';
import { createTestDatabase } from '../../scripts/word-kitchen/test-db.mjs';
if (process.env.WORD_KITCHEN_BROWSER_TEST !== '1')
	throw new Error('Browser fixture requires test runner.');
process.env.GCS_BUCKET_NAME = '';
export const db = await createTestDatabase();
if (process.env.WORD_KITCHEN_BROWSER_QUOTA_TEST === '1') {
	// Exhaust the daily allowance without making paid provider requests.
	await db.exec(`insert into game_generation_jobs(id,child_id,idempotency_key,request_hash,input,status)
	 select gen_random_uuid(),1,gen_random_uuid(),'quota-fixture',
	 jsonb_build_object('favoriteName','Quota fixture '||n),'failed'
	 from generate_series(1,5) n;`);
}
const seed = JSON.parse(await fs.readFile('resources/word-kitchen/seed.json', 'utf8'));
for (const c of seed.concepts)
	await db.query('insert into kitchen_concepts(id,kind,label,tags)values($1,$2,$3,$4)', [
		c.id,
		c.kind,
		c.label,
		c.tags
	]);
for (const a of seed.assets) {
	await db.query(
		`insert into kitchen_asset_identities(id,concept_id,state,style,view,contract)values($1,$2,'whole','word-kitchen-v1','three-quarter','kitchen-asset.v1')`,
		[a.identityId, a.conceptId]
	);
	await db.query(
		`insert into kitchen_asset_revisions(id,identity_id,revision,metadata,report,ready)values($1,$2,1,$3,$4,true)`,
		[a.revisionId, a.identityId, JSON.stringify(a.metadata), JSON.stringify(a.report)]
	);
	for (const v of a.variants)
		await db.query(
			'insert into kitchen_asset_variants(revision_id,label,object_path,generation,metadata)values($1,$2,$3,$4,$5)',
			[a.revisionId, v.label, v.object_path, v.generation, JSON.stringify(v.metadata)]
		);
	await db.query(
		`update kitchen_asset_identities set status='ready',ready_revision_id=$1 where id=$2`,
		[a.revisionId, a.identityId]
	);
}
for (const { definition: r, checksum } of seed.recipes) {
	await db.query(`insert into game_recipes(id,slug,origin)values($1,$2,'curated')`, [
		r.recipeId,
		r.title
	]);
	await db.query(
		`insert into game_recipe_revisions(id,recipe_id,revision,definition,checksum,status)values($1,$2,1,$3,$4,'published')`,
		[r.revisionId, r.recipeId, JSON.stringify(r), checksum]
	);
	await db.query('update game_recipes set published_revision_id=$1 where id=$2', [
		r.revisionId,
		r.recipeId
	]);
}
const tables = new Set(
	(await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(
		(r) => r.tablename
	)
);
const response = (body, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ident = (name) => {
	if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw new Error('Invalid fixture identifier');
	return `"${name}"`;
};
globalThis.fetch = async (input, init) => {
	const request = new Request(input, init);
	const url = new URL(request.url);
	if (url.origin !== 'https://kitchen-tests.supabase.co')
		throw new Error(`Unexpected external request: ${url.origin}`);
	const name = url.pathname.split('/').pop();
	try {
		if (url.pathname.includes('/rpc/')) {
			if (!name.startsWith('wk_')) throw new Error('Unsupported RPC');
			const body = await request.json();
			const entries = Object.entries(body);
			const result = await db.query(
				`select ${ident(name)}(${entries.map(([key], i) => `${ident(key)}=>$${i + 1}`).join(',')}) result`,
				entries.map(([, value]) =>
					value && typeof value === 'object' ? JSON.stringify(value) : value
				)
			);
			return response(result.rows[0].result);
		}
		if (!tables.has(name)) return response([]);
		const table = ident(name);
		const values = [];
		const conditions = [];
		for (const [key, value] of url.searchParams) {
			if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
			const column = ident(key);
			const dot = value.indexOf('.');
			const op = value.slice(0, dot);
			const raw = value.slice(dot + 1);
			if (op === 'is') {
				conditions.push(
					`${column} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`
				);
				continue;
			}
			if (op === 'in') {
				const items = raw
					.slice(1, -1)
					.split(',')
					.map((s) => s.replace(/^"|"$/g, ''));
				if (!items.length || items[0] === '') {
					conditions.push('false');
					continue;
				}
				const positions = items.map((v) => {
					values.push(v);
					return `$${values.length}`;
				});
				conditions.push(`${column} in (${positions.join(',')})`);
				continue;
			}
			const sql = { eq: '=', neq: '<>', gte: '>=', lte: '<=', gt: '>', lt: '<' }[op];
			if (!sql) throw new Error(`Unsupported filter ${op}`);
			values.push(raw);
			conditions.push(`${column}${sql}$${values.length}`);
		}
		const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
		if (request.method === 'GET') {
			const selected = url.searchParams.get('select') ?? '*';
			const columns =
				selected === '*' || selected.includes('(') ? '*' : selected.split(',').map(ident).join(',');
			let tail = '';
			const order = url.searchParams.get('order');
			if (order)
				tail =
					' order by ' +
					order
						.split(',')
						.map((s) => {
							const [c, d] = s.split('.');
							return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`;
						})
						.join(',');
			const limit = Number(url.searchParams.get('limit'));
			if (limit > 0) tail += ` limit ${Math.min(10000, limit)}`;
			const result = await db.query(`select ${columns} from ${table}${where}${tail}`, values);
			if (request.headers.get('accept')?.includes('vnd.pgrst.object'))
				return result.rows.length === 1
					? response(result.rows[0])
					: response(
							{ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Not found' },
							406
						);
			return response(result.rows);
		}
		if (request.method === 'DELETE') {
			await db.query(`delete from ${table}${where}`, values);
			return response(null);
		}
		const body = await request.json();
		const records = Array.isArray(body) ? body : [body];
		const rows = [];
		for (const record of records) {
			const keys = Object.keys(record);
			const columns = keys.map(ident).join(',');
			if (request.method === 'POST') {
				const conflict = url.searchParams.get('on_conflict') ?? 'id';
				const upsert = request.headers.get('prefer')?.includes('resolution=');
				const ignore = request.headers.get('prefer')?.includes('ignore-duplicates');
				const tail = upsert
					? ` on conflict(${conflict.split(',').map(ident).join(',')}) ${ignore ? 'do nothing' : `do update set ${keys.map((k) => `${ident(k)}=excluded.${ident(k)}`).join(',')}`}`
					: '';
				const result = await db.query(
					`insert into ${table}(${columns})select ${columns} from jsonb_populate_record(null::${table},$1::jsonb)${tail} returning *`,
					[JSON.stringify(record)]
				);
				rows.push(...result.rows);
			} else if (request.method === 'PATCH') {
				values.push(JSON.stringify(record));
				const p = `$${values.length}`;
				const result = await db.query(
					`update ${table} set (${columns})=(select ${columns} from jsonb_populate_record(null::${table},${p}::jsonb))${where} returning *`,
					values
				);
				rows.push(...result.rows);
			} else throw new Error('Unsupported method');
		}
		if (request.headers.get('accept')?.includes('vnd.pgrst.object'))
			return response(rows[0] ?? null);
		return response(rows, request.method === 'POST' ? 201 : 200);
	} catch (e) {
		console.error('Fixture database operation failed', name, e.message);
		return response({ code: e.code ?? 'P0001', message: e.message }, 400);
	}
};
