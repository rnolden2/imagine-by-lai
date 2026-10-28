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
	story_length_minutes: 5,
	internal_billing_reference: 'SENSITIVE_BILLING_SENTINEL'
}));
const settings = new Map(
	children.map(({ id }) => [
		id,
		{
			id,
			child_id: id,
			operations: ['addition'],
			config: { maxNumber: 10, time: { minuteStep: 15 } },
			updated_at: '2026-01-01T00:00:00Z',
			internal_operator_cost: 'SENSITIVE_COST_SENTINEL'
		}
	])
);
const attempts = [];
const receipts = new Map();
const devices = [];
const stories = [
	{
		id: 1,
		child_id: 1,
		prompt: 'Alex story',
		content:
			'# A safe story\n\n<script>window.storyScriptRan=true</script><img src=x onerror="window.storyScriptRan=true"><p onclick="window.storyScriptRan=true">Hello **friend**.</p>',
		image_url: null,
		grade_level: '1',
		internal_provider_metadata: 'SENSITIVE_PROVIDER_SENTINEL'
	},
	{
		id: 2,
		child_id: 2,
		prompt: 'Sam private story',
		content: 'Sam private story text',
		image_url: null,
		grade_level: 'K',
		internal_provider_metadata: 'SENSITIVE_PROVIDER_SENTINEL'
	}
];
const response = (value, status = 200) =>
	new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
	const request = new Request(input, init);
	const url = new URL(request.url);
	if (url.origin !== 'https://math-tests.supabase.co')
		throw new Error(`Unexpected external request in math test: ${url.origin}`);
	const table = url.pathname.split('/').pop();
	if (request.method === 'POST' && table === 'wk_rate_limit') return response(true);
	if (request.method === 'POST' && table === 'app_admin_catalog_counts')
		return response({ storyCount: stories.length, lessonCount: 0, spellingWordCount: 0 });
	if (request.method === 'POST' && table === 'app_practice_summaries') {
		const sessions = new Map();
		for (const row of attempts) {
			const key = `${row.child_id}:${row.session_id}`;
			const session = sessions.get(key) ?? {
				child_id: row.child_id,
				child_name: row.child_profiles.name,
				session_id: row.session_id,
				started_at: row.created_at,
				total: 0,
				correct: 0
			};
			session.total++;
			if (row.is_correct) session.correct++;
			if (row.created_at < session.started_at) session.started_at = row.created_at;
			sessions.set(key, session);
		}
		return response({
			mathStats: [...sessions.values()]
				.sort((a, b) => b.started_at.localeCompare(a.started_at))
				.slice(0, 100),
			spellingStats: [],
			mathAttemptCount: attempts.length,
			spellingAttemptCount: 0
		});
	}
	if (request.method === 'POST' && table === 'app_record_practice') {
		const body = await request.json();
		const previous = receipts.get(body.p_id);
		if (previous && previous !== body.p_hash)
			return response({ code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' }, 409);
		if (!previous) {
			if (body.p_kind === 'math') {
				attempts.push({
					...body.p_payload,
					created_at: new Date().toISOString(),
					child_profiles: { name: children.find((child) => child.id === body.p_child)?.name }
				});
			}
			receipts.set(body.p_id, body.p_hash);
		}
		return response(true);
	}
	if (request.method === 'GET') {
		let rows =
			table === 'child_profiles'
				? children
				: table === 'math_settings'
					? [...settings.values()]
					: table === 'math_attempts'
						? attempts
						: table === 'stories'
							? stories
							: table === 'game_devices'
								? devices
								: [];
		for (const key of ['id', 'child_id', 'token_hash']) {
			const filter = url.searchParams.get(key);
			if (filter?.startsWith('eq.'))
				rows = rows.filter((row) => String(row[key]) === filter.slice(3));
			if (filter?.startsWith('in.')) {
				const ids = filter.slice(4, -1).split(',').map(Number);
				rows = rows.filter((row) => ids.includes(row[key]));
			}
		}
		const sharedChildren = url.searchParams
			.get('or')
			?.match(/^\(child_id\.is\.null,child_id\.in\.\(([\d,]+)\)\)$/);
		if (sharedChildren) {
			const ids = sharedChildren[1].split(',').map(Number);
			rows = rows.filter((row) => row.child_id === null || ids.includes(row.child_id));
		}
		const selection = url.searchParams.get('select');
		if (selection && /^[a-z_]+(?:,[a-z_]+)*$/.test(selection)) {
			const columns = selection.split(',');
			rows = rows.map((row) =>
				Object.fromEntries(
					columns.filter((column) => column in row).map((column) => [column, row[column]])
				)
			);
		}
		if (request.headers.get('accept')?.includes('vnd.pgrst.object'))
			return rows.length === 1
				? response(rows[0])
				: response({ code: 'PGRST116', details: 'The result contains 0 rows' }, 406);
		return response(rows);
	}
	if (request.method === 'POST' && table === 'game_devices') {
		const row = await request.json();
		devices.push({ ...row, revoked_at: null });
		return response(null, 201);
	}
	if (request.method === 'PATCH' && table === 'game_devices') {
		const row = devices.find((device) => `eq.${device.id}` === url.searchParams.get('id'));
		if (row) Object.assign(row, await request.json());
		return response(null);
	}
	if (request.method === 'POST' && table === 'spelling_attempts') {
		return response(null, 201);
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
