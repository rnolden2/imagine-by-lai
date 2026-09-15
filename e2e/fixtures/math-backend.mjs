// Preloaded only by playwright.math.config.ts. No production database is contacted.
if (process.env.MATH_BROWSER_TEST !== '1')
	throw new Error('Math fixture requires the test runner.');
// Math and settings do not need the image bucket during these tests.
process.env.GCS_BUCKET_NAME = '';
const children = [
	{ id: 1, name: 'Alex', grade: '1', gender: 'boy' },
	{ id: 2, name: 'Sam', grade: 'K', gender: 'girl' },
	{ id: 3, name: 'Save Failure', grade: '1', gender: 'boy' }
].map((child) => ({
	...child,
	character_description: null,
	story_themes: [],
	story_length_minutes: 5
}));
const settings = new Map(
	children.map(({ id }) => [
		id,
		{
			id,
			child_id: id,
			operations: ['addition'],
			config: { maxNumber: 10, time: { minuteStep: 15 } },
			updated_at: '2026-01-01T00:00:00Z'
		}
	])
);
const attempts = [];
const response = (value, status = 200) =>
	new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
	const request = new Request(input, init);
	const url = new URL(request.url);
	if (url.origin !== 'https://math-tests.supabase.co')
		throw new Error(`Unexpected external request in math test: ${url.origin}`);
	const table = url.pathname.split('/').pop();
	if (request.method === 'GET') {
		let rows =
			table === 'child_profiles'
				? children
				: table === 'math_settings'
					? [...settings.values()]
					: table === 'math_attempts'
						? attempts
						: [];
		for (const key of ['id', 'child_id']) {
			const filter = url.searchParams.get(key);
			if (filter?.startsWith('eq.'))
				rows = rows.filter((row) => row[key] === Number(filter.slice(3)));
		}
		return response(rows);
	}
	if (request.method === 'POST' && table === 'math_settings') {
		const row = await request.json();
		if (row.child_id === 3)
			return response({ code: '42501', message: 'Simulated database write failure' }, 403);
		if (
			url.searchParams.get('on_conflict') !== 'child_id' ||
			!request.headers.get('prefer')?.includes('resolution=merge-duplicates')
		)
			throw new Error('Expected an upsert on child_id');
		settings.set(row.child_id, { ...row, id: row.child_id });
		return response([settings.get(row.child_id)], 201);
	}
	if (request.method === 'POST' && table === 'math_attempts') {
		const row = await request.json();
		attempts.push({
			...row,
			created_at: new Date().toISOString(),
			child_profiles: { name: children.find((child) => child.id === row.child_id)?.name }
		});
		return response(null, 201);
	}
	throw new Error(`Unexpected math test request: ${request.method} ${url.pathname}`);
};
