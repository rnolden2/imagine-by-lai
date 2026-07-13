import type { Actions } from './$types';
import { fail, redirect, isRedirect, error as kitError } from '@sveltejs/kit';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { generateStoryText, getGeminiImageModel } from '$lib/server/ai';
import type { PageServerLoad } from './$types';
import type { User, Story } from '$lib/types';
import { uploadStoryImage } from '$lib/server/image-storage';

if (!GCS_BUCKET_NAME) {
	throw new Error('Missing GCS_BUCKET_NAME environment variable.');
}

export const load: PageServerLoad = async () => {
	let usersResult: any[] | null = null;
	let storiesResult: any[] | null = null;

	try {
		const supabase = await getSupabase();
		const [usersResponse, storiesResponse] = await Promise.all([
			supabase.from('child_profiles').select('*').order('name', { ascending: true }),
			supabase
				.from('stories')
				.select('*')
				.not('image_url', 'is', null)
				.neq('image_url', '')
				.order('created_at', { ascending: false })
		]);

		if (usersResponse.error) throwSupabaseError('loading child profiles', usersResponse.error);
		if (storiesResponse.error) throwSupabaseError('loading stories', storiesResponse.error);

		usersResult = usersResponse.data;
		storiesResult = storiesResponse.data;
	} catch (supabaseError) {
		throw kitError(503, getSupabaseErrorMessage(supabaseError));
	}

	const users = (usersResult ?? []).map((u: any) => ({
		...u,
		user_id: u.id
	})) as User[];

	const stories = (storiesResult ?? []).map((s: any) => ({
		...s,
		child_id: s.child_id,
		user_id: s.child_id
	})) as Story[];

	return { users, stories, latestBackup: null };
};

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

function normalizeStoryThemes(data: FormData): string[] | null {
	if (data.get('noTheme') === 'true') return [];

	const themes = data
		.getAll('storyThemes')
		.map((theme) => String(theme).trim())
		.filter(Boolean);
	const customTheme = String(data.get('customStoryTheme') ?? '').trim();

	if (customTheme) themes.push(customTheme);

	const uniqueThemes = [...new Set(themes)];
	return uniqueThemes.length > 0 ? uniqueThemes : null;
}

// Generate dynamic story prompt based on user and customized themes
function generateStoryPrompt(
	userPrompt: string,
	user: User | null,
	storyThemesOverride: string[] | null
): string {
	if (!user) {
		return `Create a short, exciting, and creative story for a young reader based on the following idea: "${userPrompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very end, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
	}

	const metadata = getGradeMetadata(user.grade);
	const length = user.story_length_minutes
		? `${user.story_length_minutes} minutes`
		: metadata.readingTime;
	const childDescription =
		user.gender === 'boy'
			? `a ${user.grade} grade boy named ${user.name}`
			: `a ${user.grade} grade girl named ${user.name}`;

	const storyThemes = storyThemesOverride ?? user.story_themes ?? [];
	const themesStr =
		storyThemes.length > 0
			? `Focus the story elements around these themes: ${storyThemes.join(', ')}.`
			: '';

	return `Create an exciting and creative story for ${childDescription} based on this idea: "${userPrompt}". 
${themesStr}

Requirements:
- Reading time: ${length}
- Use ${metadata.complexity}
- Make it appropriate for grade ${user.grade}
- Include a positive life lesson appropriate for grade ${user.grade}
- Make the story engaging and age-appropriate

At the very end, on a new line, write a short, simple sentence describing the main visual scene for an illustration.`;
}

// Generate dynamic image prompt based on user with custom character look
function generateImagePrompt(basePrompt: string, user: User | null): string {
	if (!user) {
		return `An illustration for a children's storybook: ${basePrompt}`;
	}

	const defaultDescription =
		user.gender === 'boy'
			? 'a young boy with short curly hair and brown skin'
			: 'a young girl with long curly hair and brown skin';

	const characterDescription = user.character_description || defaultDescription;

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
		// Mock backup loading - Supabase databases are permanent in the cloud
		return {
			success: true,
			message: 'All stories are safely stored in your cloud Supabase database!'
		};
	},

	generateStory: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt');
		const userIdStr = data.get('userId');
		const storyThemesOverride = normalizeStoryThemes(data);

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
				const supabase = await getSupabase();
				const { data: child, error } = await supabase
					.from('child_profiles')
					.select('*')
					.eq('id', userId)
					.single();
				if (error) throwSupabaseError('loading selected child profile', error);
				if (child) {
					user = {
						...child,
						user_id: child.id
					} as unknown as User;
				}

				if (!user) {
					return fail(400, { error: 'Selected user not found. Please select a valid user.' });
				}
			} catch (dbError) {
				console.error('Database error fetching user:', dbError);
				return fail(503, { error: getSupabaseErrorMessage(dbError) });
			}
		}

		let storyContent: string;
		let imagePromptText: string;
		let imageUrl: string | null = null;
		let imageObjectName: string | null = null;

		try {
			const storyPrompt = generateStoryPrompt(prompt, user, storyThemesOverride);

			console.log(
				`Generating story for ${user ? `${user.name} (Grade ${user.grade})` : 'anonymous user'}...`
			);

			const fullText = await withTimeout(
				generateStoryText(storyPrompt),
				60000, // 60 second timeout
				'Story generation timed out. Please try again.'
			);

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
			const imageGenModel = await getGeminiImageModel();
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

			const storedImage = await withTimeout(
				uploadStoryImage(imageBuffer),
				30000,
				'Image upload timed out'
			);

			imageUrl = storedImage.url;
			imageObjectName = storedImage.objectName;

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
			const supabase = await getSupabase();
			const { data: newStory, error } = await supabase
				.from('stories')
				.insert({
					prompt,
					content: storyContent,
					image_url: imageUrl,
					image_object_name: imageObjectName,
					grade_level: user?.grade || '1',
					child_id: user?.id || null
				})
				.select('id')
				.single();
			if (error) throwSupabaseError('saving generated story', error);

			console.log(`Story saved to database with ID: ${newStory.id}`);

			// 5. Redirect to the new story
			throw redirect(303, `/story/${newStory.id}`);
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
			return fail(error instanceof Error && error.name === 'SupabaseConnectionError' ? 503 : 500, {
				error:
					error instanceof Error && error.name === 'SupabaseConnectionError'
						? getSupabaseErrorMessage(error)
						: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
			});
		}
	}
};
