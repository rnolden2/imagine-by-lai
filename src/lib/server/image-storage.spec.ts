import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
	sign: vi.fn(),
	save: vi.fn(),
	remove: vi.fn(),
	download: vi.fn(),
	metadata: vi.fn(),
	rpc: vi.fn(),
	file: vi.fn(),
	getFiles: vi.fn()
}));
vi.mock('./secrets', () => ({ GCS_BUCKET_NAME: 'fixture-bucket' }));
vi.mock('./db', () => ({
	getSupabase: async () => ({ rpc: mock.rpc }),
	throwSupabaseError: () => {
		throw new Error('Database unavailable');
	}
}));
vi.mock('@google-cloud/storage', () => ({
	Storage: class {
		bucket() {
			return { file: mock.file, getFiles: mock.getFiles };
		}
	}
}));
import {
	assertStoryImageObject,
	deliverStoryImage,
	objectNameFromGcsUrl,
	uploadStoryImage,
	deleteStoryImageObject,
	downloadImageFromGcsUrl,
	getStoryImageGeneration,
	uploadStoryJobImage,
	downloadStoryImageObject,
	listUnassignedStoryImages
} from './image-storage';

const object = 'imagine-by-lai/story-images/fixture.png';
beforeEach(() => {
	vi.resetAllMocks();
	mock.file.mockReturnValue({
		getSignedUrl: mock.sign,
		save: mock.save,
		delete: mock.remove,
		getMetadata: mock.metadata,
		download: mock.download
	});
	mock.sign.mockResolvedValue(['https://fixture.invalid/temporary']);
	mock.rpc.mockResolvedValue({ data: true, error: null });
});
it('signs images for one hour and marks newly stored objects private', async () => {
	const before = Date.now();
	await expect(uploadStoryImage(Buffer.from('fixture'))).resolves.toMatchObject({
		url: 'https://fixture.invalid/temporary'
	});
	expect(mock.save).toHaveBeenCalledWith(
		expect.any(Buffer),
		expect.objectContaining({
			metadata: { contentType: 'image/png', cacheControl: 'private, no-store' }
		})
	);
	const options = mock.sign.mock.calls[0][0];
	expect(options).toMatchObject({ version: 'v4', action: 'read' });
	expect(options.expires).toBeGreaterThanOrEqual(before + 3600000);
	expect(options.expires).toBeLessThanOrEqual(Date.now() + 3600000);
});
it('accepts only story objects in the configured bucket', async () => {
	expect(
		objectNameFromGcsUrl(`https://storage.googleapis.com/fixture-bucket/${object}?legacy=true`)
	).toBe(object);
	expect(objectNameFromGcsUrl(`https://fixture-bucket.storage.googleapis.com/${object}`)).toBe(
		object
	);
	for (const url of [
		`https://evil.example/fixture-bucket/${object}`,
		`https://storage.googleapis.com/other-bucket/${object}`,
		`http://storage.googleapis.com/fixture-bucket/${object}`,
		`https://user:pass@storage.googleapis.com/fixture-bucket/${object}`,
		'https://storage.googleapis.com/fixture-bucket/private.png',
		'https://storage.googleapis.com/fixture-bucket/imagine-by-lai/story-images/%2E%2E%2Fprivate.png'
	]) {
		expect(objectNameFromGcsUrl(url)).toBeNull();
		await expect(downloadImageFromGcsUrl(url)).rejects.toThrow('Could not resolve');
	}
	for (const value of [
		'private.png',
		'../fixture.png',
		object + '?token=secret',
		'imagine-by-lai/story-images/../private.png'
	]) {
		expect(() => assertStoryImageObject(value)).toThrow('Invalid story image object');
		await expect(deleteStoryImageObject(value, '100')).rejects.toThrow();
	}
	expect(mock.file).not.toHaveBeenCalled();
});
it('reserves orphan cleanup before uploading and stops if the reservation cannot persist', async () => {
	await uploadStoryImage(Buffer.from('fixture'));
	expect(mock.rpc).toHaveBeenCalledWith('app_schedule_story_image_cleanup', {
		p_object: expect.stringMatching(/^imagine-by-lai\/story-images\/.+\.png$/)
	});
	expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.save.mock.invocationCallOrder[0]);
	mock.save.mockClear();
	mock.rpc.mockResolvedValue({ error: { message: 'fixture failure' } });
	await expect(uploadStoryImage(Buffer.from('fixture'))).rejects.toThrow('Database unavailable');
	expect(mock.save).not.toHaveBeenCalled();
});
it('uses generation preconditions so an old deletion cannot remove a replacement object', async () => {
	mock.metadata.mockResolvedValue([{ generation: '12345' }]);
	await expect(getStoryImageGeneration(object)).resolves.toBe('12345');
	await deleteStoryImageObject(object, '12345');
	expect(mock.remove).toHaveBeenCalledWith({ ignoreNotFound: true, ifGenerationMatch: '12345' });
	await expect(deleteStoryImageObject(object, '')).rejects.toThrow('generation is required');
});
it('stores deterministic job images once without creating a second cleanup reservation', async () => {
	await uploadStoryJobImage(object, Buffer.from('fixture'));
	expect(mock.file).toHaveBeenCalledWith(object);
	expect(mock.save).toHaveBeenCalledWith(
		Buffer.from('fixture'),
		expect.objectContaining({
			resumable: false,
			timeout: 20000,
			preconditionOpts: { ifGenerationMatch: 0 },
			metadata: { contentType: 'image/png', cacheControl: 'private, no-store' }
		})
	);
	expect(mock.rpc).not.toHaveBeenCalled();
});
it('bounds and verifies image input downloads before sending them to a provider', async () => {
	const image = Buffer.from('fixture-image');
	mock.metadata.mockResolvedValue([{ size: String(image.length) }]);
	mock.download.mockResolvedValue([image]);
	await expect(downloadStoryImageObject(object)).resolves.toEqual(image);

	mock.metadata.mockResolvedValueOnce([{ size: String(20 * 1024 * 1024 + 1) }]);
	await expect(downloadStoryImageObject(object)).rejects.toThrow('INVALID_SIZE');
	mock.metadata.mockResolvedValueOnce([{ size: String(image.length + 1) }]);
	await expect(downloadStoryImageObject(object)).rejects.toThrow('INVALID_SIZE');
});
it('lists one bounded storage page and returns its opaque continuation token', async () => {
	mock.getFiles.mockResolvedValue([
		[
			{ name: object, metadata: { timeCreated: '2026-10-23T00:00:00Z' } },
			{
				name: 'imagine-by-lai/story-images/assigned.png',
				metadata: { timeCreated: '2026-10-22T00:00:00Z' }
			}
		],
		{ pageToken: 'next-token' }
	]);
	const result = await listUnassignedStoryImages(
		new Set(['imagine-by-lai/story-images/assigned.png']),
		new Set(),
		'current-token'
	);
	expect(mock.getFiles).toHaveBeenCalledWith({
		prefix: 'imagine-by-lai/story-images',
		maxResults: 100,
		autoPaginate: false,
		pageToken: 'current-token'
	});
	expect(result).toMatchObject({
		hasMore: true,
		nextPageToken: 'next-token',
		images: [{ objectName: object }]
	});
});
it('replaces legacy URLs and preserves readable stories when signing fails', async () => {
	const story = {
		id: 1,
		content: 'Story text',
		image_url: `https://storage.googleapis.com/fixture-bucket/${object}?expires=2491`
	};
	await expect(deliverStoryImage(story)).resolves.toMatchObject({
		content: 'Story text',
		image_url: 'https://fixture.invalid/temporary'
	});
	mock.sign.mockRejectedValue(new Error('private provider diagnostics'));
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	await expect(deliverStoryImage(story)).resolves.toMatchObject({
		content: 'Story text',
		image_url: null
	});
	expect(log).toHaveBeenCalledExactlyOnceWith('story.image.delivery.failed');
	log.mockRestore();
	await expect(
		deliverStoryImage({ ...story, image_url: 'https://untrusted.invalid/image.png' })
	).resolves.toMatchObject({ image_url: null });
});
