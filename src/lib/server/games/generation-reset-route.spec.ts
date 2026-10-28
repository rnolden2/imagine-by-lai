import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), enqueue: vi.fn() }));
vi.mock('#lib/server/db', () => ({ getSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock('#lib/server/games/queue', () => ({ enqueueAndDispatchGeneration: mocks.enqueue }));
vi.mock('#lib/server/games/generation', () => ({ generationPolicy: { dailyJobs: 5 } }));
vi.mock('#lib/server/games/revisions', () => ({ reviseRecipe: vi.fn() }));
vi.mock('#lib/server/games/authorization', () => ({
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

it('returns only the public job identity after accepting generation', async () => {
	const key = randomUUID();
	mocks.enqueue.mockResolvedValue({
		id: '11111111-1111-4111-a111-111111111111',
		status: 'queued',
		child_id: 1,
		request_hash: 'private-hash',
		idempotency_key: key,
		estimated_cost: 0.3,
		actual_cost: 0,
		checkpoint: { private: true },
		lease_token: 4
	});
	const response = await POST(
		event({ action: 'generate', childId: 1, favoriteId: randomUUID(), key })
	);
	expect(response.status).toBe(202);
	expect(await response.json()).toEqual({
		id: '11111111-1111-4111-a111-111111111111',
		status: 'queued'
	});
	expect(mocks.enqueue).toHaveBeenCalledWith(1, expect.any(String), key);
});
