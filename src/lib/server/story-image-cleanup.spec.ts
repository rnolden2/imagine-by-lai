import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
	rpc: vi.fn(),
	from: vi.fn(),
	generation: vi.fn(),
	remove: vi.fn(),
	parse: vi.fn()
}));
vi.mock('./db', () => ({
	getSupabase: async () => ({ rpc: mock.rpc, from: mock.from }),
	throwSupabaseError: () => {
		throw new Error('Database unavailable');
	}
}));
vi.mock('./image-storage', () => ({
	getStoryImageGeneration: mock.generation,
	deleteStoryImageObject: mock.remove,
	objectNameFromGcsUrl: mock.parse
}));
import { collectStoryImages, normalizeLegacyStoryImages } from './story-image-cleanup';

const item = {
	object_name: 'imagine-by-lai/story-images/fixture.png',
	lease_token: 3,
	generation: null
};
let query: Record<string, ReturnType<typeof vi.fn>>;
let claims: (Omit<typeof item, 'generation'> & { generation: string | null })[];
beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	claims = [{ ...item }];
	query = {};
	for (const name of ['select', 'is', 'not', 'neq', 'eq', 'order', 'update'])
		query[name] = vi.fn(() => query);
	query.limit = vi.fn().mockResolvedValue({ data: [], error: null });
	mock.from.mockReturnValue(query);
	mock.rpc.mockImplementation(async (name) => ({
		data:
			name === 'app_claim_story_image_cleanup'
				? (claims.shift() ?? null)
				: name === 'app_bind_story_image_generation'
					? '100'
					: true,
		error: null
	}));
	mock.generation.mockResolvedValue('100');
	mock.remove.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
it('persists the generation before deleting and acknowledges success', async () => {
	await collectStoryImages();
	expect(mock.rpc).toHaveBeenCalledWith('app_bind_story_image_generation', {
		p_object: item.object_name,
		p_token: 3,
		p_generation: '100'
	});
	expect(mock.remove).toHaveBeenCalledExactlyOnceWith(item.object_name, '100');
	expect(mock.rpc).toHaveBeenCalledWith('app_finish_story_image_cleanup', {
		p_object: item.object_name,
		p_token: 3,
		p_error: null
	});
});
it('uses a persisted generation on retry and leaves conflicts for investigation', async () => {
	claims = [{ ...item, generation: '99' }];
	mock.remove.mockRejectedValue({ code: 412, message: 'private storage diagnostics' });
	await collectStoryImages();
	expect(mock.generation).not.toHaveBeenCalled();
	expect(mock.remove).toHaveBeenCalledWith(item.object_name, '99');
	expect(mock.rpc).toHaveBeenCalledWith('app_finish_story_image_cleanup', {
		p_object: item.object_name,
		p_token: 3,
		p_error: 'GENERATION_CONFLICT'
	});
	expect(console.error).toHaveBeenCalledExactlyOnceWith('story.image.cleanup.failed', {
		code: 'GENERATION_CONFLICT'
	});
});
it('acknowledges a missing object, but records transient storage failure for retry', async () => {
	mock.generation.mockRejectedValueOnce({ code: 404 });
	await collectStoryImages();
	expect(mock.remove).not.toHaveBeenCalled();
	expect(mock.rpc).toHaveBeenCalledWith('app_finish_story_image_cleanup', {
		p_object: item.object_name,
		p_token: 3,
		p_error: null
	});
	claims = [{ ...item }];
	mock.generation.mockRejectedValueOnce({ code: 503 });
	await collectStoryImages();
	expect(mock.rpc).toHaveBeenCalledWith('app_finish_story_image_cleanup', {
		p_object: item.object_name,
		p_token: 3,
		p_error: 'STORAGE_ERROR'
	});
});
it('does not perform storage deletion after losing the lease', async () => {
	mock.rpc.mockImplementation(async (name) => ({
		data: name === 'app_claim_story_image_cleanup' ? (claims.shift() ?? null) : null,
		error: null
	}));
	await collectStoryImages();
	expect(mock.remove).not.toHaveBeenCalled();
	expect(mock.rpc.mock.calls.some(([name]) => name === 'app_finish_story_image_cleanup')).toBe(
		false
	);
});
it('propagates a lost database acknowledgement so the durable lease can be retried', async () => {
	mock.rpc.mockImplementation(async (name) =>
		name === 'app_finish_story_image_cleanup'
			? { error: { message: 'lost acknowledgement' } }
			: {
					data: name === 'app_claim_story_image_cleanup' ? (claims.shift() ?? null) : '100',
					error: null
				}
	);
	await expect(collectStoryImages()).rejects.toThrow('Database unavailable');
	expect(mock.remove).toHaveBeenCalledTimes(1);
});
it('normalizes only trusted legacy URLs and compares the old value before updating', async () => {
	query.limit.mockResolvedValue({
		data: [
			{ id: 1, image_url: 'trusted fixture' },
			{ id: 2, image_url: 'untrusted fixture' }
		],
		error: null
	});
	mock.parse.mockImplementation((url) => (url === 'trusted fixture' ? item.object_name : null));
	await normalizeLegacyStoryImages();
	expect(query.update).toHaveBeenCalledExactlyOnceWith({ image_object_name: item.object_name });
	expect(query.eq).toHaveBeenCalledWith('id', 1);
	expect(query.eq).toHaveBeenCalledWith('image_url', 'trusted fixture');
	expect(query.is).toHaveBeenCalledWith('image_object_name', null);
	expect(console.error).toHaveBeenCalledExactlyOnceWith('story.image.legacy.unresolved', {
		count: 1
	});
});
