import { beforeEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	from: vi.fn(),
	row: null as Record<string, unknown> | null
}));
vi.mock('#lib/server/db', () => ({ getSupabase: mocks.get }));
import { authorizeRequest } from './application-security';
import { access, requireChild } from './games/authorization';

const token = randomBytes(32).toString('base64url');
function event(
	route: string,
	options: { parent?: boolean; token?: string; method?: string; origin?: string } = {}
) {
	const url = new URL(route.replace('[id]', '2'), 'https://app.example');
	return {
		route: { id: route },
		url,
		request: new Request(url, {
			method: options.method ?? 'GET',
			headers: { origin: options.origin ?? url.origin }
		}),
		cookies: { get: () => options.token },
		locals: options.parent ? { user: { isAdmin: true } } : {}
	} as unknown as RequestEvent;
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.row = {
		id: 'device-id',
		child_ids: [1],
		expires_at: new Date(Date.now() + 60000).toISOString(),
		revoked_at: null
	};
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn(async () => ({ data: mocks.row, error: null }))
	};
	mocks.get.mockResolvedValue({ from: mocks.from });
	mocks.from.mockReturnValue(query);
});
it.each(['/', '/math', '/spelling', '/story/[id]', '/games/space-math', '/new-private-route'])(
	'redirects anonymous page %s before querying data',
	async (route) => {
		await expect(authorizeRequest(event(route))).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(mocks.get).not.toHaveBeenCalled();
	}
);
it.each(['/api/math', '/api/spelling', '/api/math/settings', '/api/define', '/api/tts'])(
	'rejects anonymous API %s before any database or provider work',
	async (route) => {
		await expect(authorizeRequest(event(route))).rejects.toMatchObject({ status: 403 });
		expect(mocks.get).not.toHaveBeenCalled();
	}
);
it('requires a parent session for settings APIs and actions', async () => {
	await expect(
		authorizeRequest(event('/api/settings/games', { token, method: 'POST' }))
	).rejects.toMatchObject({ status: 403 });
	await expect(
		authorizeRequest(event('/settings', { token, method: 'POST' }))
	).rejects.toMatchObject({ status: 303 });
	await expect(authorizeRequest(event('/settings', { parent: true }))).resolves.toBeUndefined();
	expect(mocks.get).not.toHaveBeenCalled();
});
it('keeps non-personalized public routes available without the database', async () => {
	for (const route of ['/science', '/games', '/login', '/health/live', '/health/ready'])
		await expect(authorizeRequest(event(route))).resolves.toBeUndefined();
	expect(mocks.get).not.toHaveBeenCalled();
});
it('protects mutations even with a valid parent session', async () => {
	for (const origin of ['', 'https://evil.example']) {
		await expect(
			authorizeRequest(event('/settings', { parent: true, method: 'POST', origin }))
		).rejects.toMatchObject({ status: 403 });
	}
});
it('resolves a device once per request and enforces its child scope', async () => {
	const e = event('/math', { token });
	await authorizeRequest(e);
	expect(await requireChild(e, 1)).toMatchObject({ childIds: [1], parent: false });
	await expect(requireChild(e, 2)).rejects.toMatchObject({ status: 404 });
	expect(mocks.from).toHaveBeenCalledOnce();
	expect(mocks.from).toHaveBeenCalledWith('game_devices');
});
it.each([
	{ expires_at: new Date(0).toISOString() },
	{ expires_at: 'invalid' },
	{ revoked_at: new Date().toISOString() },
	{ child_ids: [] },
	{ child_ids: ['1) OR true'] }
])('rejects expired, revoked, or invalid device records: %j', async (patch) => {
	Object.assign(mocks.row!, patch);
	await expect(access(event('/math', { token }))).rejects.toMatchObject({ status: 403 });
});
it('rechecks device revocation on the next request', async () => {
	expect(await access(event('/math', { token }))).toMatchObject({ childIds: [1] });
	mocks.row!.revoked_at = new Date().toISOString();
	await expect(access(event('/math', { token }))).rejects.toMatchObject({ status: 403 });
});
it('fails closed when the authorization database is unavailable', async () => {
	mocks.get.mockRejectedValue(new Error('unavailable'));
	await expect(authorizeRequest(event('/math', { token }))).rejects.toThrow('unavailable');
});
