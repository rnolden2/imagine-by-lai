import type { Actions } from './$types';
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { Storage } from '@google-cloud/storage';
import { getGeminiApiKey, GCS_BUCKET_NAME } from '$lib/server/secrets';
import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import type { User, Story } from '$lib/types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as Story[];
	return { users, stories };
};

// Asynchronously initialize the Gemini models
let textModel: GenerativeModel;
let imageModel: GenerativeModel;

async function getTextModel(): Promise<GenerativeModel> {
	if (textModel) return textModel;
	const apiKey = await getGeminiApiKey();
	const genAI = new GoogleGenerativeAI(apiKey);
	textModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
	return textModel;
}

async function getImageModel(): Promise<GenerativeModel> {
	if (imageModel) return imageModel;
	const apiKey = await getGeminiApiKey();
	const genAI = new GoogleGenerativeAI(apiKey);
	imageModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
	return imageModel;
}

if (!GCS_BUCKET_NAME) {
	throw new Error('Missing GCS_BUCKET_NAME environment variable.');
}

const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET_NAME);

export const actions: Actions = {
	generateStory: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt');

		if (!prompt || typeof prompt !== 'string') {
			return fail(400, { error: 'A story prompt is required.' });
		}

		try {
			const storyModel = await getTextModel();

			// 1. Generate the story
			const storyPrompt = `Create a short, exciting, and creative story for a 6-year-old based on the following idea: "${prompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very end, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
			const storyResult = await storyModel.generateContent(storyPrompt);
			const fullText = await storyResult.response.text();

			const parts = fullText.trim().split('\n');
			const storyContent = parts.slice(0, -1).join('\n').trim();
			const imagePrompt = parts[parts.length - 1].trim();
			let imageUrl: string | null = null;

			// 2. Generate and upload the image (in a separate try/catch)
			try {
				const imageGenModel = await getImageModel();
				const response = await imageGenModel.generateContent(
					`An illustration for a children's storybook: ${imagePrompt}, if a illustration of a child is created make sure for girls it is a little brown girl with curly long hair and for boys a little brown boy with curly short hair`
				);

				let imageBuffer: Buffer | null = null;

				for (const part of response.response.candidates?.[0].content.parts || []) {
					if (part.inlineData) {
						const imageData = part.inlineData.data;
						imageBuffer = Buffer.from(imageData, 'base64');
						break;
					}
				}

				if (!imageBuffer) {
					throw new Error('No image data found in API response.');
				}
				const imageName = `imagine-by-lai/story-${Date.now()}.png`;
				const file = bucket.file(imageName);

				await file.save(imageBuffer, {
					metadata: { contentType: 'image/png' }
				});

				[imageUrl] = await file.getSignedUrl({
					action: 'read',
					expires: '03-09-2491'
				});
			} catch (imgError) {
				console.error('Image generation or upload failed:', imgError);
				// Continue without an image
			}

			// 4. Save to database
			const db = getDb();
			const stmt = db.prepare(
				'INSERT INTO stories (prompt, content, image_url, grade_level) VALUES (?, ?, ?, ?)'
			);
			const info = stmt.run(prompt, storyContent, imageUrl, '1');

			// 5. Redirect to the new story
			throw redirect(303, `/story/${info.lastInsertRowid}`);
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
			console.error(error);
			return fail(500, { error: 'Failed to generate the story. Please try again.' });
		}
	}
};
