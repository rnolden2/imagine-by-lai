import { getDb } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { User, Lesson, Story } from '$lib/types';
import { GCS_BUCKET_NAME, getGeminiApiKey } from '$lib/server/secrets';
import { Storage } from '@google-cloud/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const lessons = db.prepare('SELECT * FROM lessons').all() as Lesson[];
	const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as Story[];
	const storiesWithoutImages = db
		.prepare('SELECT * FROM stories WHERE image_url IS NULL ORDER BY created_at DESC')
		.all() as Story[];

	let backups: { name: string; timeCreated: string }[] = [];
	let availableImages: { url: string; name: string; timeCreated: string }[] = [];
	let gcsError: string | null = null;

	try {
		if (!GCS_BUCKET_NAME) {
			gcsError = 'GCS_BUCKET_NAME environment variable is not configured';
			console.warn('GCS_BUCKET_NAME not set - image assignment features will be limited');
		} else {
			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);

			// Fetch backups
			try {
				const [backupFiles] = await bucket.getFiles({ prefix: 'backups/' });
				backups = backupFiles
					.filter((file) => file.name.endsWith('.db'))
					.map((file) => ({
						name: file.name,
						timeCreated: file.metadata.timeCreated as string
					}))
					.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
			} catch (backupError) {
				console.error('Failed to fetch backups:', backupError);
				if (!gcsError) {
					gcsError = 'Failed to fetch backups from Google Cloud Storage';
				}
			}

			// Fetch available images
			try {
				const [imageFiles] = await bucket.getFiles({ prefix: 'imagine-by-lai/story-' });
				const allImages = await Promise.all(
					imageFiles
						.filter((file) => file.name.endsWith('.png'))
						.sort((a, b) => {
							const timeA = new Date(a.metadata.timeCreated as string).getTime();
							const timeB = new Date(b.metadata.timeCreated as string).getTime();
							return timeB - timeA; // Most recent first
						})
						.map(async (file) => {
							const [url] = await file.getSignedUrl({
								action: 'read',
								expires: '03-09-2491'
							});
							return {
								url,
								name: file.name.replace('imagine-by-lai/', ''),
								timeCreated: file.metadata.timeCreated as string
							};
						})
				);

				const storyImageUrls = new Set(stories.map((s) => s.image_url).filter(Boolean));
				availableImages = allImages.filter((img) => !storyImageUrls.has(img.url));
			} catch (imageError) {
				console.error('Failed to fetch images:', imageError);
				if (!gcsError) {
					gcsError = 'Failed to fetch images from Google Cloud Storage';
				}
			}
		}
	} catch (error) {
		console.error('Failed to initialize GCS:', error);
		gcsError = `Google Cloud Storage error: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}

	return {
		users,
		lessons,
		stories,
		storiesWithoutImages,
		availableImages,
		backups,
		gcsError
	};
};

export const actions: Actions = {
	addUser: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name');
		const grade = data.get('grade');
		const gender = data.get('gender');

		if (!name || !grade || !gender) {
			return fail(400, { message: 'All user fields are required' });
		}
		const db = getDb();
		db.prepare('INSERT INTO users (name, grade, gender) VALUES (?, ?, ?)').run(name, grade, gender);
		return { success: true };
	},

	deleteUser: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM users WHERE id = ?').run(id);
		return { success: true };
	},

	addLesson: async ({ request }) => {
		const data = await request.formData();
		const lesson = data.get('lesson');

		if (!lesson) {
			return fail(400, { message: 'Lesson text is required' });
		}
		const db = getDb();
		db.prepare('INSERT INTO lessons (lesson) VALUES (?)').run(lesson);
		return { success: true };
	},

	deleteLesson: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
		return { success: true };
	},

	deleteStory: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM stories WHERE id = ?').run(id);
		return { success: true };
	},

	assignImageToStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = data.get('storyId');
		const imageUrl = data.get('imageUrl');

		if (!storyId || !imageUrl) {
			return fail(400, { message: 'Story ID and image URL are required.' });
		}

		if (typeof storyId !== 'string' || typeof imageUrl !== 'string') {
			return fail(400, { message: 'Invalid data format.' });
		}

		try {
			const db = getDb();
			
			// Verify the story exists
			const story = db.prepare('SELECT id FROM stories WHERE id = ?').get(storyId);
			if (!story) {
				return fail(404, { message: 'Story not found.' });
			}

			// Update the story with the image URL
			db.prepare('UPDATE stories SET image_url = ? WHERE id = ?').run(imageUrl, storyId);

			return { 
				success: true, 
				message: `Image successfully assigned to story #${storyId}`,
				storyId 
			};
		} catch (error) {
			console.error('Failed to assign image to story:', error);
			return fail(500, { message: 'Failed to assign image to story.' });
		}
	},

	backupDatabase: async () => {
		try {
			const { GCS_BUCKET_NAME } = await import('$lib/server/secrets');
			const { Storage } = await import('@google-cloud/storage');
			const fs = await import('fs/promises');

			if (!GCS_BUCKET_NAME) {
				return fail(500, { message: 'GCS_BUCKET_NAME is not configured.' });
			}

			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);

			const db = getDb();
			// Close the connection to ensure WAL is flushed to the main DB file
			db.close();

			const dbBuffer = await fs.readFile('imagine.db');
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const fileName = `backups/backup-${timestamp}.db`;
			const file = bucket.file(fileName);

			await file.save(dbBuffer);

			return { success: true, message: `Database backed up to ${fileName}` };
		} catch (error) {
			console.error('Database backup failed:', error);
			return fail(500, { message: 'Database backup failed.' });
		}
	},

	restoreDatabase: async ({ request }) => {
		const data = await request.formData();
		const fileName = data.get('fileName');

		if (!fileName || typeof fileName !== 'string') {
			return fail(400, { message: 'File name is required.' });
		}

		try {
			const { GCS_BUCKET_NAME } = await import('$lib/server/secrets');
			const { Storage } = await import('@google-cloud/storage');
			const fs = await import('fs/promises');

			if (!GCS_BUCKET_NAME) {
				return fail(500, { message: 'GCS_BUCKET_NAME is not configured.' });
			}

			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(fileName);

			const tempPath = 'imagine.db.tmp';
			await file.download({ destination: tempPath });

			const db = getDb();
			db.close();

			await fs.rename(tempPath, 'imagine.db');

			return { success: true, message: 'Database restored successfully. Please restart the server.' };
		} catch (error) {
			console.error('Database restore failed:', error);
			return fail(500, { message: 'Database restore failed.' });
		}
	},

	createStoryFromImage: async ({ request }) => {
		const data = await request.formData();
		const imageUrl = data.get('imageUrl');
		const prompt = data.get('prompt');

		if (!imageUrl || !prompt || typeof imageUrl !== 'string' || typeof prompt !== 'string') {
			return fail(400, { message: 'Image URL and prompt are required.' });
		}

		try {
			const apiKey = await getGeminiApiKey();
			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

			const storage = new Storage();
			const url = new URL(imageUrl);
			const bucketName = url.hostname.split('.')[0];
			const fileName = url.pathname.substring(1);

			const bucket = storage.bucket(bucketName);
			const file = bucket.file(decodeURIComponent(fileName));
			const [imageBuffer] = await file.download();

			const imagePart = {
				inlineData: {
					data: imageBuffer.toString('base64'),
					mimeType: 'image/png'
				}
			};

			const result = await model.generateContent([prompt, imagePart]);
			const storyContent = result.response.text();

			const db = getDb();
			const info = db
				.prepare(
					'INSERT INTO stories (prompt, content, image_url, grade_level) VALUES (?, ?, ?, ?)'
				)
				.run(prompt, storyContent, imageUrl, '1');

			throw redirect(303, `/story/${info.lastInsertRowid}`);
		} catch (error) {
			console.error('Failed to create story from image:', error);
			return fail(500, { message: 'Failed to create story from image.' });
		}
	}
};
