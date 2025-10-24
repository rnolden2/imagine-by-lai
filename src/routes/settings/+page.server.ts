import { getDb } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { User, Lesson, Story } from '$lib/types';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { Storage } from '@google-cloud/storage';

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

	try {
		if (GCS_BUCKET_NAME) {
			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);

			// Fetch backups
			const [backupFiles] = await bucket.getFiles({ prefix: 'backups/' });
			backups = backupFiles
				.filter((file) => file.name.endsWith('.db'))
				.map((file) => ({
					name: file.name,
					timeCreated: file.metadata.timeCreated as string
				}))
				.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());

			// Fetch available images
			const [imageFiles] = await bucket.getFiles({ prefix: 'imagine-by-lai/story-' });
			availableImages = await Promise.all(
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
		}
	} catch (error) {
		console.error('Failed to fetch GCS data:', error);
	}

	return {
		users,
		lessons,
		stories,
		storiesWithoutImages,
		availableImages,
		backups
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
	}
};
