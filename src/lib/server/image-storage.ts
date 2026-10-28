import { randomUUID } from 'node:crypto';
import { Storage, type GetFilesOptions } from '@google-cloud/storage';
import { GCS_BUCKET_NAME } from './secrets';
import { getSupabase, throwSupabaseError } from './db';

const STORY_IMAGE_PREFIX = 'imagine-by-lai/story-images';
const SIGNED_URL_LIFETIME_MS = 60 * 60 * 1000;
const MAX_STORY_IMAGE_BYTES = 20 * 1024 * 1024;

type StoredStoryImage = {
	url: string;
	objectName: string;
};

let storage: Storage | undefined;

function getBucket() {
	if (!GCS_BUCKET_NAME) {
		throw new Error('GCS_BUCKET_NAME is not configured.');
	}
	storage ??= new Storage();
	return storage.bucket(GCS_BUCKET_NAME);
}

async function deadline<T>(work: Promise<T>, milliseconds: number, code: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(code)), milliseconds);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function getSignedImageUrl(objectName: string): Promise<string> {
	assertStoryImageObject(objectName);
	const [url] = await getBucket()
		.file(objectName)
		.getSignedUrl({
			version: 'v4',
			action: 'read',
			expires: Date.now() + SIGNED_URL_LIFETIME_MS
		});
	return url;
}

export async function uploadStoryImage(imageBuffer: Buffer): Promise<StoredStoryImage> {
	const objectName = `${STORY_IMAGE_PREFIX}/${Date.now()}-${randomUUID()}.png`;
	const db = await getSupabase();
	const reservation = await db.rpc('app_schedule_story_image_cleanup', { p_object: objectName });
	if (reservation.error) throwSupabaseError('reserving story image cleanup', reservation.error);
	const file = getBucket().file(objectName);

	await file.save(imageBuffer, {
		metadata: {
			contentType: 'image/png',
			cacheControl: 'private, no-store'
		},
		resumable: false,
		timeout: 20000,
		preconditionOpts: { ifGenerationMatch: 0 }
	});

	return {
		objectName,
		url: await getSignedImageUrl(objectName)
	};
}

/** Uploads the deterministic object already pinned by a durable story job. */
export async function uploadStoryJobImage(objectName: string, imageBuffer: Buffer): Promise<void> {
	assertStoryImageObject(objectName);
	if (imageBuffer.length > MAX_STORY_IMAGE_BYTES) throw new Error('STORY_IMAGE_TOO_LARGE');
	await getBucket()
		.file(objectName)
		.save(imageBuffer, {
			metadata: { contentType: 'image/png', cacheControl: 'private, no-store' },
			resumable: false,
			timeout: 20000,
			preconditionOpts: { ifGenerationMatch: 0 }
		});
}

export async function listUnassignedStoryImages(
	assignedObjectNames: Set<string>,
	assignedUrls: Set<string>,
	pageToken?: string,
	findAssigned?: (objectNames: string[]) => Promise<Set<string>>
): Promise<{
	images: { url: string; objectName: string; name: string; timeCreated: string }[];
	hasMore: boolean;
	nextPageToken: string | null;
}> {
	const query: GetFilesOptions = {
		prefix: STORY_IMAGE_PREFIX,
		maxResults: 100,
		autoPaginate: false,
		...(pageToken ? { pageToken } : {})
	};
	const [files, nextQuery] = await getBucket().getFiles(query);
	const candidates = files.filter(
		(file) => file.name.endsWith('.png') && !assignedObjectNames.has(file.name)
	);
	const assignedBeyondLoadedPage = findAssigned
		? await findAssigned(candidates.map((file) => file.name))
		: new Set<string>();
	const images = await Promise.all(
		candidates
			.filter((file) => !assignedBeyondLoadedPage.has(file.name))
			.sort((a, b) => {
				const timeA = new Date(a.metadata.timeCreated as string).getTime();
				const timeB = new Date(b.metadata.timeCreated as string).getTime();
				return timeB - timeA;
			})
			.map(async (file) => {
				const url = await getSignedImageUrl(file.name);
				return {
					url,
					objectName: file.name,
					name: file.name.replace(`${STORY_IMAGE_PREFIX}/`, ''),
					timeCreated: file.metadata.timeCreated as string
				};
			})
	);
	return {
		images: images.filter((image) => !assignedUrls.has(image.url)),
		hasMore: Boolean(nextQuery),
		nextPageToken: String((nextQuery as GetFilesOptions | null)?.pageToken ?? '') || null
	};
}

export function objectNameFromGcsUrl(imageUrl: string): string | null {
	try {
		const url = new URL(imageUrl);
		const parts = url.pathname.split('/').filter(Boolean);
		if (url.protocol !== 'https:' || url.username || url.password) return null;
		const object =
			url.hostname === 'storage.googleapis.com' && parts[0] === GCS_BUCKET_NAME
				? decodeURIComponent(parts.slice(1).join('/'))
				: url.hostname === `${GCS_BUCKET_NAME}.storage.googleapis.com`
					? decodeURIComponent(parts.join('/'))
					: null;
		if (object) {
			assertStoryImageObject(object);
			return object;
		}
	} catch {
		return null;
	}

	return null;
}

export async function downloadImageFromGcsUrl(imageUrl: string): Promise<{
	buffer: Buffer;
	objectName: string | null;
}> {
	const objectName = objectNameFromGcsUrl(imageUrl);
	if (!objectName) {
		throw new Error('Could not resolve Google Cloud Storage object name from image URL.');
	}

	const [buffer] = await getBucket().file(objectName).download();
	return { buffer, objectName };
}

export async function downloadStoryImageObject(objectName: string): Promise<Buffer> {
	assertStoryImageObject(objectName);
	const file = getBucket().file(objectName);
	const [metadata] = await deadline(file.getMetadata(), 10000, 'STORY_IMAGE_METADATA_TIMEOUT');
	const size = Number(metadata.size);
	if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_STORY_IMAGE_BYTES)
		throw new Error('STORY_IMAGE_INVALID_SIZE');
	const [buffer] = await deadline(file.download(), 20000, 'STORY_IMAGE_DOWNLOAD_TIMEOUT');
	if (buffer.length !== size || buffer.length > MAX_STORY_IMAGE_BYTES)
		throw new Error('STORY_IMAGE_INVALID_SIZE');
	return buffer;
}

export async function getStoryImageGeneration(objectName: string): Promise<string> {
	assertStoryImageObject(objectName);
	const [metadata] = await deadline(
		getBucket().file(objectName).getMetadata(),
		10000,
		'STORY_IMAGE_METADATA_TIMEOUT'
	);
	const generation = String(metadata.generation ?? '');
	if (!/^\d+$/.test(generation)) throw new Error('Invalid image generation.');
	return generation;
}

export async function deleteStoryImageObject(
	objectName: string,
	generation: string
): Promise<void> {
	assertStoryImageObject(objectName);
	if (!/^\d+$/.test(generation)) throw new Error('An image generation is required for deletion.');
	await getBucket()
		.file(objectName)
		.delete({ ignoreNotFound: true, ifGenerationMatch: generation });
}

export function assertStoryImageObject(objectName: string) {
	if (
		!objectName.startsWith(`${STORY_IMAGE_PREFIX}/`) ||
		!objectName.endsWith('.png') ||
		objectName.length > 500 ||
		objectName.split('/').some((part) => !part || part === '.' || part === '..') ||
		!/^[a-zA-Z0-9/_.-]+$/.test(objectName)
	)
		throw new Error('Invalid story image object.');
}

/** Never return a legacy, long-lived URL stored in the database to the browser. */
export async function deliverStoryImage<
	T extends { image_url: string | null; image_object_name?: string | null }
>(story: T): Promise<T> {
	const object = story.image_object_name ?? objectNameFromGcsUrl(story.image_url ?? '');
	if (!object) return { ...story, image_url: null };
	try {
		return { ...story, image_url: await getSignedImageUrl(object) };
	} catch {
		console.error('story.image.delivery.failed');
		return { ...story, image_url: null };
	}
}
