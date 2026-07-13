import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { GCS_BUCKET_NAME } from './secrets';

const STORY_IMAGE_PREFIX = 'imagine-by-lai/story-images';
const SIGNED_URL_EXPIRES = '03-09-2491';

type StoredStoryImage = {
	url: string;
	objectName: string;
};

const storage = new Storage();

function getBucket() {
	if (!GCS_BUCKET_NAME) {
		throw new Error('GCS_BUCKET_NAME is not configured.');
	}
	return storage.bucket(GCS_BUCKET_NAME);
}

export async function getSignedImageUrl(objectName: string): Promise<string> {
	const [url] = await getBucket().file(objectName).getSignedUrl({
		action: 'read',
		expires: SIGNED_URL_EXPIRES
	});
	return url;
}

export async function uploadStoryImage(imageBuffer: Buffer): Promise<StoredStoryImage> {
	const objectName = `${STORY_IMAGE_PREFIX}/${Date.now()}-${randomUUID()}.png`;
	const file = getBucket().file(objectName);

	await file.save(imageBuffer, {
		metadata: {
			contentType: 'image/png',
			cacheControl: 'public, max-age=31536000, immutable'
		},
		resumable: false
	});

	return {
		objectName,
		url: await getSignedImageUrl(objectName)
	};
}

export async function listUnassignedStoryImages(
	assignedObjectNames: Set<string>,
	assignedUrls: Set<string>
): Promise<{ url: string; objectName: string; name: string; timeCreated: string }[]> {
	const [files] = await getBucket().getFiles({ prefix: STORY_IMAGE_PREFIX });
	const images = await Promise.all(
		files
			.filter((file) => file.name.endsWith('.png') && !assignedObjectNames.has(file.name))
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

	return images.filter((image) => !assignedUrls.has(image.url));
}

export function objectNameFromGcsUrl(imageUrl: string): string | null {
	try {
		const url = new URL(imageUrl);
		const parts = url.pathname.split('/').filter(Boolean);

		if (parts.length >= 2 && parts[0] === GCS_BUCKET_NAME) {
			return decodeURIComponent(parts.slice(1).join('/'));
		}

		const objectStart = parts.findIndex((part) => part === 'imagine-by-lai');
		if (objectStart >= 0) {
			return decodeURIComponent(parts.slice(objectStart).join('/'));
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

export async function deleteStoryImageObject(objectName: string): Promise<void> {
	if (!objectName) return;

	await getBucket().file(objectName).delete({ ignoreNotFound: true });
}
