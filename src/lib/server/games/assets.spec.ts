import { beforeEach, expect, it, vi } from 'vitest';
import type { Recipe } from '#lib/games/word-kitchen/contracts';

const mocks = vi.hoisted(() => ({
	variants: [] as { revision_id: string; object_path: string; generation: string }[],
	sign: vi.fn(),
	active: 0,
	maximumActive: 0
}));

vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({
		from: () => ({
			select: () => ({
				in: () => ({
					eq: async () => ({ data: mocks.variants, error: null })
				})
			})
		})
	})
}));
vi.mock('#lib/server/secrets', () => ({ GCS_BUCKET_NAME: 'fixture-bucket' }));
vi.mock('@google-cloud/storage', () => ({
	Storage: class {
		bucket(bucket: string) {
			return {
				file: (path: string, options: { generation: string }) => ({
					getSignedUrl: (request: unknown) => mocks.sign(bucket, path, options, request)
				})
			};
		}
	}
}));

import { deliveryManifest } from './assets';

const revision = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const recipe = (count: number, duplicateLast = false) =>
	({
		assetRequirements: Array.from({ length: count }, (_, index) => ({
			role: `role-${index}`,
			conceptId: `ingredient:item-${index}`,
			assetRevisionId: duplicateLast && index === count - 1 ? revision(0) : revision(index)
		}))
	}) as Recipe;

beforeEach(() => {
	mocks.variants = [];
	mocks.active = 0;
	mocks.maximumActive = 0;
	mocks.sign.mockReset();
	mocks.sign.mockImplementation(async (_bucket, path) => {
		mocks.active++;
		mocks.maximumActive = Math.max(mocks.maximumActive, mocks.active);
		await new Promise((resolve) => setTimeout(resolve, 2));
		mocks.active--;
		return [`https://delivery.invalid/${path}`];
	});
});

it('bounds private URL signing and reuses one URL for duplicate asset revisions', async () => {
	const input = recipe(18, true);
	mocks.variants = input.assetRequirements.slice(0, 17).map((asset, index) => ({
		revision_id: asset.assetRevisionId,
		object_path: `imagine-by-lai/word-kitchen/assets/${index}/512.webp`,
		generation: String(index + 1)
	}));
	const manifest = await deliveryManifest(input);
	expect(Object.keys(manifest)).toHaveLength(18);
	expect(mocks.sign).toHaveBeenCalledTimes(17);
	expect(mocks.maximumActive).toBeGreaterThan(1);
	expect(mocks.maximumActive).toBeLessThanOrEqual(8);
	expect(manifest['role-17'].url).toBe(manifest['role-0'].url);
	expect(mocks.sign).toHaveBeenCalledWith(
		'fixture-bucket',
		'imagine-by-lai/word-kitchen/assets/0/512.webp',
		{ generation: '1' },
		expect.objectContaining({ version: 'v4', action: 'read' })
	);
});

it('uses repository assets without signing and rejects missing or unsafe variants', async () => {
	const input = recipe(1);
	mocks.variants = [
		{
			revision_id: input.assetRequirements[0].assetRevisionId,
			object_path: 'static/word-kitchen/fixture/512.webp',
			generation: '1'
		}
	];
	await expect(deliveryManifest(input)).resolves.toMatchObject({
		'role-0': { url: '/word-kitchen/fixture/512.webp', width: 512 }
	});
	expect(mocks.sign).not.toHaveBeenCalled();
	mocks.variants = [];
	await expect(deliveryManifest(input)).rejects.toThrow('ASSET_NOT_READY');
	mocks.variants = [
		{
			revision_id: input.assetRequirements[0].assetRevisionId,
			object_path: 'other-bucket/private.webp',
			generation: '1'
		}
	];
	await expect(deliveryManifest(input)).rejects.toThrow('INVALID_ASSET_PATH');
});
