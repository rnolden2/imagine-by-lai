import type { Actions } from './$types';
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { Storage } from '@google-cloud/storage';
import { getGeminiApiKey, GCS_BUCKET_NAME } from '$lib/server/secrets';
import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import type { User, Story } from '$lib/types';

if (!GCS_BUCKET_NAME) {
	throw new Error('Missing GCS_BUCKET_NAME environment variable.');
}

const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET_NAME);

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as Story[];
	
	let latestBackup: { name: string; timeCreated: string } | null = null;
	
	// Fetch latest backup if no stories exist
	if (stories.length === 0 && GCS_BUCKET_NAME) {
		try {
			const [backupFiles] = await bucket.getFiles({ prefix: 'backups/' });
			const backups = backupFiles
				.filter((file) => file.name.endsWith('.db'))
				.map((file) => ({
					name: file.name,
					timeCreated: file.metadata.timeCreated as string
				}))
				.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
			
			if (backups.length > 0) {
				latestBackup = backups[0];
			}
		} catch (error) {
			console.error('Failed to fetch latest backup:', error);
		}
	}
	
	return { users, stories, latestBackup };
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

// Error types for better error handling
class StoryGenerationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'StoryGenerationError';
	}
}

class ImageGenerationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'ImageGenerationError';
	}
}

class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

// Helper function to get grade-appropriate reading time and complexity
function getGradeMetadata(grade: string) {
	const gradeNum = parseInt(grade) || 1;

	if (gradeNum <= 1) {
		return {
			readingTime: '3-4 minutes',
			complexity: 'very simple sentences with basic vocabulary',
			storyLength: 'short'
		};
	} else if (gradeNum <= 3) {
		return {
			readingTime: '5-6 minutes',
			complexity: 'simple sentences with some descriptive words',
			storyLength: 'medium'
		};
	} else if (gradeNum <= 5) {
		return {
			readingTime: '7-8 minutes',
			complexity: 'varied sentence structures with richer vocabulary',
			storyLength: 'longer'
		};
	} else {
		return {
			readingTime: '8-10 minutes',
			complexity: 'complex sentences with advanced vocabulary',
			storyLength: 'longer and more detailed'
		};
	}
}

// Generate dynamic story prompt based on user
function generateStoryPrompt(userPrompt: string, user: User | null): string {
	if (!user) {
		// Fallback for when no user is selected
		return `Create a short, exciting, and creative story for a young reader based on the following idea: "${userPrompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very end, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
	}

	const metadata = getGradeMetadata(user.grade);
	const childDescription =
		user.gender === 'boy'
			? `a ${user.grade} grade boy named ${user.name}`
			: `a ${user.grade} grade girl named ${user.name}`;

	return `Create an exciting and creative story for ${childDescription} based on this idea: "${userPrompt}". 

Requirements:
- Reading time: ${metadata.readingTime}
- Use ${metadata.complexity}
- Make it ${metadata.storyLength}
- Include a positive life lesson appropriate for grade ${user.grade}
- Make the story engaging and age-appropriate

At the very end, on a new line, write a short, simple sentence describing the main visual scene for an illustration.`;
}

// Generate dynamic image prompt based on user
function generateImagePrompt(basePrompt: string, user: User | null): string {
	if (!user) {
		return `An illustration for a children's storybook: ${basePrompt}`;
	}

	const characterDescription =
		user.gender === 'boy'
			? 'a young boy with short curly hair and brown skin'
			: 'a young girl with long curly hair and brown skin';

	return `An illustration for a children's storybook: ${basePrompt}. If the illustration includes a child character, depict them as ${characterDescription}. Use a warm, colorful, and friendly art style suitable for grade ${user.grade} readers.`;
}

// Validate API response
function validateStoryResponse(text: string): { story: string; imagePrompt: string } {
	if (!text || text.trim().length === 0) {
		throw new ValidationError('Generated story is empty');
	}

	const parts = text.trim().split('\n');
	if (parts.length < 2) {
		throw new ValidationError('Story format is invalid - missing image prompt');
	}

	const storyContent = parts.slice(0, -1).join('\n').trim();
	const imagePrompt = parts[parts.length - 1].trim();

	if (storyContent.length < 100) {
		throw new ValidationError('Generated story is too short');
	}

	if (imagePrompt.length < 10) {
		throw new ValidationError('Image prompt is too short');
	}

	return { story: storyContent, imagePrompt };
}

// Timeout wrapper for API calls
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutMessage: string
): Promise<T> {
	let timeoutHandle: NodeJS.Timeout | undefined;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(new Error(timeoutMessage));
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		if (timeoutHandle) clearTimeout(timeoutHandle);
		return result;
	} catch (error) {
		if (timeoutHandle) clearTimeout(timeoutHandle);
		throw error;
	}
}

export const actions: Actions = {
	loadStoriesFromBackup: async () => {
		try {
			if (!GCS_BUCKET_NAME) {
				return fail(500, { error: 'GCS_BUCKET_NAME is not configured.' });
			}

			// Get latest backup
			const [backupFiles] = await bucket.getFiles({ prefix: 'backups/' });
			const backups = backupFiles
				.filter((file) => file.name.endsWith('.db'))
				.map((file) => ({
					name: file.name,
					timeCreated: file.metadata.timeCreated as string
				}))
				.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());

			if (backups.length === 0) {
				return fail(404, { error: 'No backups found in storage.' });
			}

			const latestBackup = backups[0];
			const fs = await import('fs/promises');
			const file = bucket.file(latestBackup.name);

			const tempPath = 'imagine.db.tmp';
			await file.download({ destination: tempPath });

			const db = getDb();
			db.close();

			await fs.rename(tempPath, 'imagine.db');

			return {
				success: true,
				message: 'Stories loaded successfully from backup! The page will refresh.'
			};
		} catch (error) {
			console.error('Failed to load stories from backup:', error);
			return fail(500, { error: 'Failed to load stories from backup. Please try again.' });
		}
	},

	generateStory: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt');
		const userIdStr = data.get('userId');

		// Validate inputs
		if (!prompt || typeof prompt !== 'string') {
			return fail(400, { error: 'A story prompt is required.' });
		}

		if (prompt.trim().length < 10) {
			return fail(400, {
				error: 'Please provide a more detailed story prompt (at least 10 characters).'
			});
		}

		// Get user if specified
		let user: User | null = null;
		if (userIdStr) {
			const userId = parseInt(userIdStr as string);
			if (isNaN(userId)) {
				return fail(400, { error: 'Invalid user ID.' });
			}

			try {
				const db = getDb();
				const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
				user = (stmt.get(userId) as User | undefined) || null;

				if (!user) {
					return fail(400, { error: 'Selected user not found. Please select a valid user.' });
				}
			} catch (dbError) {
				console.error('Database error fetching user:', dbError);
				return fail(500, { error: 'Failed to load user information. Please try again.' });
			}
		}

		let storyContent: string;
		let imagePromptText: string;
		let imageUrl: string | null = null;

		try {
			// 1. Generate the story with timeout
			const storyModel = await getTextModel();
			const storyPrompt = generateStoryPrompt(prompt, user);

			console.log(
				`Generating story for ${user ? `${user.name} (Grade ${user.grade})` : 'anonymous user'}...`
			);

			const storyResult = await withTimeout(
				storyModel.generateContent(storyPrompt),
				60000, // 60 second timeout
				'Story generation timed out. Please try again.'
			);

			const fullText = await storyResult.response.text();

			// Validate the response
			try {
				const validated = validateStoryResponse(fullText);
				storyContent = validated.story;
				imagePromptText = validated.imagePrompt;
			} catch (validationError) {
				if (validationError instanceof ValidationError) {
					console.error('Story validation failed:', validationError.message);
					return fail(500, {
						error: `Story generation failed: ${validationError.message}. Please try again with a different prompt.`
					});
				}
				throw validationError;
			}

			console.log('Story generated successfully.');
		} catch (error) {
			if (error instanceof Error && error.message.includes('timed out')) {
				console.error('Story generation timeout:', error);
				return fail(504, {
					error: 'Story generation is taking too long. Please try again with a simpler prompt.'
				});
			}

			console.error('Story generation error:', error);
			throw new StoryGenerationError('Failed to generate story content', error);
		}

		// 2. Generate and upload the image (non-blocking - story will be saved even if this fails)
		try {
			const imageGenModel = await getImageModel();
			const fullImagePrompt = generateImagePrompt(imagePromptText, user);

			console.log('Generating story illustration...');

			const imageResponse = await withTimeout(
				imageGenModel.generateContent(fullImagePrompt),
				90000, // 90 second timeout for image generation
				'Image generation timed out'
			);

			let imageBuffer: Buffer | null = null;

			// Extract image data from response
			for (const part of imageResponse.response.candidates?.[0].content.parts || []) {
				if (part.inlineData) {
					const imageData = part.inlineData.data;
					imageBuffer = Buffer.from(imageData, 'base64');
					break;
				}
			}

			if (!imageBuffer) {
				throw new ImageGenerationError('No image data found in API response');
			}

			// Upload to Google Cloud Storage
			const imageName = `imagine-by-lai/story-${Date.now()}.png`;
			const file = bucket.file(imageName);

			await withTimeout(
				file.save(imageBuffer, {
					metadata: { contentType: 'image/png' }
				}),
				30000, // 30 second timeout for upload
				'Image upload timed out'
			);

			[imageUrl] = await file.getSignedUrl({
				action: 'read',
				expires: '03-09-2491'
			});

			console.log('Image generated and uploaded successfully.');
		} catch (imgError) {
			console.error('Image generation or upload failed:', imgError);

			if (imgError instanceof Error) {
				if (imgError.message.includes('timed out')) {
					console.warn('Image generation timed out - continuing without image');
				} else {
					console.warn('Image generation failed - continuing without image:', imgError.message);
				}
			}
			// Continue without an image - the story is still valuable
			imageUrl = null;
		}

		// 3. Save to database
		try {
			const db = getDb();
			const stmt = db.prepare(
				'INSERT INTO stories (prompt, content, image_url, grade_level, user_id) VALUES (?, ?, ?, ?, ?)'
			);
			const info = stmt.run(prompt, storyContent, imageUrl, user?.grade || '1', user?.id || null);

			console.log(`Story saved to database with ID: ${info.lastInsertRowid}`);

			// 4. Redirect to the new story
			throw redirect(303, `/story/${info.lastInsertRowid}`);
		} catch (error) {
			// Handle redirects
			if (isRedirect(error)) {
				throw error;
			}

			// Handle known error types
			if (error instanceof StoryGenerationError) {
				console.error('Story generation failed:', error.cause);
				return fail(500, {
					error:
						'Failed to generate the story. This might be due to API limits or connectivity issues. Please try again.'
				});
			}

			if (error instanceof ImageGenerationError) {
				console.error('Image generation failed:', error.cause);
				return fail(500, {
					error:
						'Story was generated but image creation failed. Please try again to get an illustrated story.'
				});
			}

			// Unknown errors
			console.error('Unexpected error in story generation:', error);
			return fail(500, {
				error:
					'An unexpected error occurred. Please try again or contact support if the problem persists.'
			});
		}
	}
};
