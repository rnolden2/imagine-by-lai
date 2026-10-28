import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: { AI_PROVIDER: 'openai' as string | undefined },
	adminPassword: 'fixture-admin-password',
	worker: vi.fn(() => true),
	get: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	limit: vi.fn()
}));
vi.mock('#lib/server/runtime-config', () => ({ env: mocks.env }));
vi.mock('#lib/server/secrets', () => ({
	get ADMIN_PASSWORD() {
		return mocks.adminPassword;
	}
}));
vi.mock('#lib/server/worker', () => ({ hasWorkerConfig: mocks.worker }));
vi.mock('#lib/server/db', () => ({ getSupabase: mocks.get }));

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	mocks.env.AI_PROVIDER = 'openai';
	mocks.adminPassword = 'fixture-admin-password';
	mocks.worker.mockReturnValue(true);
	mocks.get.mockResolvedValue({ from: mocks.from });
	mocks.from.mockReturnValue({ select: mocks.select });
	mocks.select.mockReturnValue({ limit: mocks.limit });
	mocks.limit.mockResolvedValue({ data: [], error: null });
});

it('reports ready after one bounded database query', async () => {
	const { checkReadiness } = await import('./health');
	await expect(checkReadiness()).resolves.toEqual({ ok: true });
	expect(mocks.from).toHaveBeenCalledExactlyOnceWith('child_profiles');
	expect(mocks.select).toHaveBeenCalledExactlyOnceWith('id');
	expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
});

it('coalesces concurrent checks and briefly caches success', async () => {
	let release!: (value: { data: never[]; error: null }) => void;
	mocks.limit.mockReturnValue(new Promise((resolve) => (release = resolve)));
	const { checkReadiness } = await import('./health');
	const checks = Array.from({ length: 20 }, () => checkReadiness());
	await vi.waitFor(() => expect(mocks.limit).toHaveBeenCalledOnce());
	release({ data: [], error: null });
	await expect(Promise.all(checks)).resolves.toEqual(Array(20).fill({ ok: true }));
	await expect(checkReadiness()).resolves.toEqual({ ok: true });
	expect(mocks.limit).toHaveBeenCalledOnce();
});

it.each([
	['short administrator secret', () => (mocks.adminPassword = 'short'), 'ADMIN_CONFIG'],
	['invalid provider selection', () => (mocks.env.AI_PROVIDER = 'invalid'), 'AI_CONFIG'],
	['missing worker configuration', () => mocks.worker.mockReturnValue(false), 'WORKER_CONFIG']
])('fails closed for %s without querying the database', async (_name, configure, code) => {
	configure();
	const { checkReadiness } = await import('./health');
	await expect(checkReadiness()).resolves.toEqual({ ok: false, code });
	expect(mocks.get).not.toHaveBeenCalled();
});

it('reports database failures without exposing diagnostics', async () => {
	const { checkReadiness } = await import('./health');
	mocks.limit.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
	await expect(checkReadiness()).resolves.toEqual({ ok: false, code: 'DATABASE' });
	mocks.get.mockRejectedValue(new Error('private secret detail'));
	await expect(checkReadiness()).resolves.toEqual({ ok: false, code: 'DATABASE' });
});
