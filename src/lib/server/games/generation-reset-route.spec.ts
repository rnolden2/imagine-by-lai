import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('$lib/server/db', () => ({ getSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock('$lib/server/games/queue', () => ({ enqueueAndDispatchGeneration: vi.fn() }));
vi.mock('$lib/server/games/generation', () => ({ generationPolicy: { dailyJobs: 5 } }));
vi.mock('$lib/server/games/revisions', () => ({ reviseRecipe: vi.fn() }));
vi.mock('$lib/server/games/authorization', () => ({
	authorizeDevice: vi.fn(),
	requireChild: vi.fn()
}));
import { POST } from '../../../routes/api/settings/games/+server';

function event(body: unknown, admin = true, origin = 'https://kitchen.example') {
	const url = new URL('https://kitchen.example/api/settings/games');
	return {
		url,
		locals: { user: admin ? { isAdmin: true } : undefined },
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', origin },
			body: JSON.stringify(body)
		})
	} as Parameters<typeof POST>[0];
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.rpc.mockResolvedValue({ data: { used: 0, limit: 5, remaining: 5 }, error: null });
});

it('lets an authenticated admin reset using the server-controlled limit', async () => {
	const key = randomUUID();
	const response = await POST(event({ action: 'reset_generation_limit', key, dailyJobs: 999 }));
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ remaining: 5 });
	expect(mocks.rpc).toHaveBeenCalledWith('wk_reset_generation_limit', { p_id: key, p_daily: 5 });
});

it('rejects non-admins and cross-origin reset requests before touching the database', async () => {
	const body = { action: 'reset_generation_limit', key: randomUUID() };
	await expect(POST(event(body, false))).rejects.toMatchObject({ status: 403 });
	await expect(POST(event(body, true, 'https://untrusted.example'))).rejects.toMatchObject({
		status: 403
	});
	expect(mocks.rpc).not.toHaveBeenCalled();
});

it('requires a valid idempotency key', async () => {
	await expect(
		POST(event({ action: 'reset_generation_limit', key: 'invalid' }))
	).rejects.toMatchObject({ status: 400 });
	expect(mocks.rpc).not.toHaveBeenCalled();
});
