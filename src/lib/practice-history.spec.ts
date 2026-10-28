import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

let storage: Record<string, unknown>;
beforeEach(() => {
	vi.resetModules();
	storage = {};
	Object.defineProperties(storage, {
		getItem: { value: (key: string) => storage[key] ?? null },
		setItem: {
			value: (key: string, value: string) => {
				storage[key] = value;
			}
		},
		removeItem: {
			value: (key: string) => {
				delete storage[key];
			}
		}
	});
	vi.stubGlobal('localStorage', storage);
	vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it('persists before dispatch and retries the identical event after a lost response', async () => {
	const fetcher = vi.fn(async () => {
		throw new Error('lost response');
	});
	vi.stubGlobal('fetch', fetcher);
	const api = await import('./practice-history');
	await expect(api.savePracticeAttempt('math', { childId: 1, givenAnswer: '3' })).rejects.toThrow();
	const original = String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body);
	expect(api.pendingPracticeCount()).toBe(1);
	const restored = await import('./practice-history');
	fetcher.mockImplementation(async () => new Response('{"success":true}') as never);
	await restored.retryPracticeHistory();
	expect(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body)).toBe(
		original
	);
	expect(restored.pendingPracticeCount()).toBe(0);
});
it('keeps unconfirmed and rejected writes pending rather than claiming success', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{}'))
	);
	const api = await import('./practice-history');
	await expect(api.savePracticeAttempt('spelling', { childId: 1, word: 'cat' })).rejects.toThrow(
		'not confirmed'
	);
	expect(api.pendingPracticeCount()).toBe(1);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{}', { status: 503 }))
	);
	await api.retryPracticeHistory();
	expect(api.pendingPracticeCount()).toBe(1);
});
it('restores independent per-event records across module reloads and expires old records', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new Error('offline');
		})
	);
	let api = await import('./practice-history');
	await expect(api.savePracticeAttempt('math', { childId: 1 })).rejects.toThrow();
	await expect(api.savePracticeAttempt('spelling', { childId: 2 })).rejects.toThrow();
	vi.resetModules();
	api = await import('./practice-history');
	expect(api.pendingPracticeCount()).toBe(2);
	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400001);
	expect(api.pendingPracticeCount()).toBe(0);
	expect(Object.keys(storage)).toHaveLength(0);
});
it('falls back to memory when persistent storage is unavailable', async () => {
	vi.stubGlobal('localStorage', {
		setItem() {
			throw new Error('denied');
		},
		getItem() {
			throw new Error('denied');
		},
		removeItem() {
			throw new Error('denied');
		}
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new Error('offline');
		})
	);
	const api = await import('./practice-history');
	await expect(api.savePracticeAttempt('math', { childId: 1 })).rejects.toThrow();
	expect(api.pendingPracticeCount()).toBe(1);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{"success":true}'))
	);
	await api.retryPracticeHistory();
	expect(api.pendingPracticeCount()).toBe(0);
});
