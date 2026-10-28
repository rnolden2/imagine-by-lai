import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('#lib/server/health', () => ({ checkReadiness: mocks.check }));

beforeEach(() => {
	vi.resetAllMocks();
	mocks.check.mockResolvedValue({ ok: true });
});

it('exposes a cache-resistant liveness response without dependencies', async () => {
	const { GET } = await import('./live/+server');
	const response = await GET({} as never);
	expect(response.status).toBe(200);
	expect(response.headers.get('cache-control')).toBe('no-store');
	await expect(response.json()).resolves.toEqual({ status: 'ok' });
	expect(mocks.check).not.toHaveBeenCalled();
});

it('exposes a generic ready response when dependencies are ready', async () => {
	const { GET } = await import('./ready/+server');
	const response = await GET({ locals: { requestId: 'fixture-request' } } as never);
	expect(response.status).toBe(200);
	expect(response.headers.get('cache-control')).toBe('no-store');
	await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

it('keeps readiness diagnostics out of the public response', async () => {
	mocks.check.mockResolvedValue({ ok: false, code: 'DATABASE' });
	const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	const { GET } = await import('./ready/+server');
	const response = await GET({ locals: { requestId: 'fixture-request' } } as never);
	expect(response.status).toBe(503);
	await expect(response.json()).resolves.toEqual({ status: 'unavailable' });
	expect(log).toHaveBeenCalledWith('health.ready.failed', {
		requestId: 'fixture-request',
		code: 'DATABASE'
	});
	log.mockRestore();
});
