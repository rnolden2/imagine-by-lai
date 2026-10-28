import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ access: vi.fn(), construct: vi.fn() }));
// All configuration is synthetic; these tests never load the real environment.
vi.mock('#lib/server/runtime-config', () => ({ env: { GCS_PROJECT_ID: 'fixture-project' } }));
vi.mock('@google-cloud/secret-manager', () => ({
	SecretManagerServiceClient: class {
		constructor() {
			mock.construct();
		}
		accessSecretVersion = mock.access;
	}
}));
beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	mock.access.mockResolvedValue([{ payload: { data: Buffer.from('fixture-secret') } }]);
});
it('coalesces concurrent secret requests, caches success, and bounds the SDK request', async () => {
	const { getOpenAIApiKey } = await import('./secrets');
	const results = await Promise.all(Array.from({ length: 20 }, () => getOpenAIApiKey()));
	expect(results.every((value) => value === 'fixture-secret')).toBe(true);
	await expect(getOpenAIApiKey()).resolves.toBe('fixture-secret');
	expect(mock.access).toHaveBeenCalledExactlyOnceWith(
		{ name: 'projects/fixture-project/secrets/openAI_api_key/versions/latest' },
		{ timeout: 5000, retry: null }
	);
	expect(mock.construct).toHaveBeenCalledTimes(1);
});
it('retries after a failed lookup without caching errors or empty payloads', async () => {
	const { getOpenAIApiKey } = await import('./secrets');
	mock.access.mockRejectedValueOnce(new Error('fixture failure'));
	await expect(getOpenAIApiKey()).rejects.toThrow('fixture failure');
	mock.access.mockResolvedValueOnce([{ payload: {} }]);
	await expect(getOpenAIApiKey()).rejects.toThrow('payload is empty');
	await expect(getOpenAIApiKey()).resolves.toBe('fixture-secret');
	expect(mock.access).toHaveBeenCalledTimes(3);
});
