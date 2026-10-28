import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ url: vi.fn(), key: vi.fn(), create: vi.fn() }));
vi.mock('#lib/server/secrets', () => ({
	getSupabaseUrl: mock.url,
	getSupabaseServiceRoleKey: mock.key
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.create }));
beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	mock.url.mockResolvedValue('https://fixture.supabase.co');
	mock.key.mockResolvedValue('fixture-server-key-that-is-more-than-forty-characters');
	mock.create.mockReturnValue({ from: vi.fn() });
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
it('shares initialization across concurrent requests', async () => {
	const { getSupabase } = await import('./index');
	const clients = await Promise.all(Array.from({ length: 25 }, () => getSupabase()));
	expect(new Set(clients).size).toBe(1);
	expect(mock.create).toHaveBeenCalledTimes(1);
	expect(mock.url).toHaveBeenCalledTimes(1);
	expect(mock.key).toHaveBeenCalledTimes(1);
});
it('recovers from unavailable configuration without caching a rejected initialization', async () => {
	const { getSupabase } = await import('./index');
	mock.url.mockRejectedValueOnce(new Error('fixture secret service unavailable'));
	await expect(getSupabase()).rejects.toThrow('could not be loaded');
	await expect(getSupabase()).resolves.toBeDefined();
	expect(mock.url).toHaveBeenCalledTimes(2);
});
it('rejects malformed database origins and keeps provider diagnostics out of public messages', async () => {
	const { getSupabase, getSupabaseErrorMessage } = await import('./index');
	for (const url of [
		'http://fixture.supabase.co',
		'https://fixture.supabase.co.evil.test',
		'https://user:password@fixture.supabase.co',
		'https://fixture.supabase.co/private'
	]) {
		mock.url.mockResolvedValue(url);
		await expect(getSupabase()).rejects.toThrow('misconfigured');
	}
	expect(mock.create).not.toHaveBeenCalled();
	expect(getSupabaseErrorMessage(new Error('private query containing child data'))).toBe(
		'The database is temporarily unavailable. Please try again shortly.'
	);
});
it('bounds database calls and preserves caller cancellation', async () => {
	const { getSupabase } = await import('./index');
	await getSupabase();
	const fetcher = vi.fn(async () => new Response('{}'));
	vi.stubGlobal('fetch', fetcher);
	const boundedFetch = mock.create.mock.calls[0][2].global.fetch as typeof fetch;
	const timeout = vi.spyOn(AbortSignal, 'timeout');
	const controller = new AbortController();
	await boundedFetch('https://fixture.supabase.co/rest/v1/stories', { signal: controller.signal });
	expect(timeout).toHaveBeenCalledWith(15000);
	const init = (fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1];
	expect(init.signal?.aborted).toBe(false);
	controller.abort();
	expect(init.signal?.aborted).toBe(true);
	timeout.mockRestore();
});
