import { createHash, randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { getSupabase } from '$lib/server/db';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { checkResult, rpc } from './common';
import type { Recipe } from '$lib/games/word-kitchen/contracts';

const storage = new Storage();
export const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export type AssetManifest = Record<
	string,
	{
		conceptId: string;
		revisionId: string;
		url: string;
		expiresAt: string;
		width: number;
		label: string;
	}
>;
export async function deliveryManifest(recipe: Recipe): Promise<AssetManifest> {
	const db = await getSupabase();
	const ids = recipe.assetRequirements.map((a) => a.assetRevisionId);
	const variants = checkResult(
		await db.from('kitchen_asset_variants').select('*').in('revision_id', ids).eq('label', '512')
	);
	const expiresAt = new Date(Date.now() + 3600000).toISOString();
	const manifest: AssetManifest = {};
	for (const asset of recipe.assetRequirements) {
		const variant = variants?.find((v) => v.revision_id === asset.assetRevisionId);
		if (!variant) throw new Error('ASSET_NOT_READY');
		// Seeded immutable public app assets require no private bucket access.
		let url: string;
		if (variant.object_path.startsWith('static/word-kitchen/'))
			url = `/${variant.object_path.slice(7)}`;
		else {
			if (!variant.object_path.startsWith('imagine-by-lai/word-kitchen/'))
				throw new Error('INVALID_ASSET_PATH');
			[url] = await storage
				.bucket(GCS_BUCKET_NAME)
				.file(variant.object_path, { generation: variant.generation })
				.getSignedUrl({ version: 'v4', action: 'read', expires: Date.parse(expiresAt) });
		}
		manifest[asset.role] = {
			conceptId: asset.conceptId,
			revisionId: asset.assetRevisionId,
			url,
			expiresAt,
			width: 512,
			label: asset.conceptId.split(':')[1].replaceAll('-', ' ')
		};
	}
	return manifest;
}
export async function processMaster(input: Buffer, opaque = false) {
	const image = sharp(input, { limitInputPixels: 16_777_216, failOn: 'warning' });
	const meta = await image.metadata();
	if (!['png', 'webp'].includes(meta.format ?? '') || !meta.width || !meta.height)
		throw new Error('INVALID_ASSET_FORMAT');
	const master = await image
		.rotate()
		.resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: opaque ? 1 : 0 } })
		.toColourspace('srgb')
		.png()
		.toBuffer();
	const { data, info } = await sharp(master)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let minX = 1024,
		minY = 1024,
		maxX = 0,
		maxY = 0,
		visible = 0,
		borderVisible = 0;
	for (let y = 0; y < info.height; y++)
		for (let x = 0; x < info.width; x++) {
			const alpha = data[(y * info.width + x) * info.channels + 3];
			if (alpha > 20) {
				visible++;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
				if (x === 0 || y === 0 || x === 1023 || y === 1023) borderVisible++;
			}
		}
	if (!visible || (!opaque && (!meta.hasAlpha || borderVisible > 50)))
		throw new Error('INVALID_ASSET_ALPHA');
	const bounds = {
		x: minX / 1024,
		y: minY / 1024,
		width: (maxX - minX + 1) / 1024,
		height: (maxY - minY + 1) / 1024
	};
	const variants = await Promise.all(
		[128, 256, 512, 1024].map(async (width) => ({
			label: String(width),
			bytes: await sharp(master).resize(width, width).webp({ quality: 85 }).toBuffer(),
			width
		}))
	);
	for (const v of variants) {
		const cap = v.width <= 256 ? 60 * 1024 : v.width === 512 ? 150 * 1024 : 350 * 1024;
		if (v.bytes.length > cap) throw new Error('ASSET_SIZE_BUDGET');
	}
	return {
		master,
		variants,
		metadata: {
			width: 1024,
			height: 1024,
			mime: 'image/png',
			bytes: master.length,
			sha256: sha(master),
			alpha: !opaque,
			bounds,
			pivot: { x: 0.5, y: 0.75 },
			anchors: {
				center: { x: 0.5, y: 0.5 },
				interior: { x: 0.5, y: 0.45 },
				spout: { x: 0.78, y: 0.3 }
			}
		},
		report: { valid: true, alphaChecked: !opaque, variantBudgets: true }
	};
}
export async function publishGeneratedAsset(
	identityId: string,
	token: number,
	input: Buffer,
	provenance: Record<string, unknown>,
	opaque = false
) {
	const result = await processMaster(input, opaque);
	const revision = randomUUID();
	const prefix = `imagine-by-lai/word-kitchen/assets/${identityId}/${revision}`;
	const bucket = storage.bucket(GCS_BUCKET_NAME);
	const variants = [];
	const masterPath = `${prefix}/master.png`;
	await bucket
		.file(masterPath)
		.save(result.master, {
			contentType: 'image/png',
			resumable: false,
 timeout:20000,
			preconditionOpts: { ifGenerationMatch: 0 }
		});
	const [masterMeta]=await bucket.file(masterPath).getMetadata();
 for (const v of result.variants) {
		const path = `${prefix}/${v.label}.webp`;
		const file = bucket.file(path);
		await file.save(v.bytes, {
			contentType: 'image/webp',
			resumable: false,
 timeout:20000,
			preconditionOpts: { ifGenerationMatch: 0 },
			metadata: { cacheControl: 'private,max-age=31536000,immutable' }
		});
		const [meta] = await file.getMetadata();
		variants.push({
			label: v.label,
			path,
			generation: meta.generation,
			metadata: {
				width: v.width,
				height: v.width,
				bytes: v.bytes.length,
				mime: 'image/webp',
				sha256: sha(v.bytes)
			}
		});
	}
	await rpc('wk_publish_asset', {
		p_identity: identityId,
		p_token: token,
		p_revision: revision,
		p_metadata: { ...result.metadata, masterPath, masterGeneration:masterMeta.generation, provenance },
		p_report: result.report,
		p_variants: variants
	});
	return revision;
}
