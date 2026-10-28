import type { Story, User } from '#lib/types';

class InvalidStoryOutput extends Error {
	constructor() {
		super('INVALID_OUTPUT');
	}
}

function gradeMetadata(grade: string) {
	const gradeNumber = Number.parseInt(grade) || 1;
	if (gradeNumber <= 1)
		return {
			readingTime: '3-4 minutes',
			complexity: 'very simple sentences with basic vocabulary'
		};
	if (gradeNumber <= 3)
		return {
			readingTime: '5-6 minutes',
			complexity: 'simple sentences with some descriptive words'
		};
	if (gradeNumber <= 5)
		return {
			readingTime: '7-8 minutes',
			complexity: 'varied sentence structures with richer vocabulary'
		};
	return { readingTime: '8-10 minutes', complexity: 'complex sentences with advanced vocabulary' };
}

export function newStoryPrompt(prompt: string, user: User | null, themesOverride: string[] | null) {
	if (!user)
		return `Create a short, exciting, and creative story for a young reader based on the following idea: "${prompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very end, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
	const metadata = gradeMetadata(user.grade);
	const length = user.story_length_minutes
		? `${user.story_length_minutes} minutes`
		: metadata.readingTime;
	const child = `a ${user.grade} grade ${user.gender} named ${user.name}`;
	const description = user.character_description?.trim();
	const themes = themesOverride ?? user.story_themes ?? [];
	const themeInstruction = themes.length
		? `Focus the story elements around these themes: ${themes.join(', ')}.`
		: '';
	return `Create an exciting and creative story for ${child} based on this idea: "${prompt}".
${themeInstruction}

Requirements:
- Reading time: ${length}
- Use ${metadata.complexity}
- Make it appropriate for grade ${user.grade}
- Include a positive life lesson appropriate for grade ${user.grade}
- Make the story engaging and age-appropriate
- If the child is described or appears in the story, use this exact character description and do not invent or change their appearance: ${description || 'Use the child’s name, grade, and gender only; do not add specific physical features.'}

At the very end, on a new line, write a short, simple sentence describing the main visual scene for an illustration.`;
}

export function newStoryImagePrompt(scene: string, user: User | null) {
	if (!user) return `An illustration for a children's storybook: ${scene}`;
	const fallback =
		user.gender === 'boy'
			? 'a young boy with short curly hair and brown skin'
			: 'a young girl with long curly hair and brown skin';
	const description = user.character_description?.trim() || fallback;
	return `An illustration for a children's storybook: ${scene}.

IMPORTANT CHARACTER CONSISTENCY:
- If a child appears in the illustration, they must be depicted as: ${description}.
- This is the authoritative description. Do not invent, omit, replace, or contradict these character details.
- Do not add a child to the illustration if the scene does not call for one.

Use a warm, colorful, and friendly art style suitable for grade ${user.grade} readers.`;
}

export function regenerationImagePrompt(story: Pick<Story, 'prompt' | 'content' | 'grade_level'>) {
	const excerpt = story.content.replace(/\s+/g, ' ').trim().slice(0, 1200);
	return [
		'Create a warm, colorful children storybook illustration.',
		`Story idea: ${story.prompt}`,
		`Grade level: ${story.grade_level}`,
		excerpt ? `Story excerpt: ${excerpt}` : '',
		'Show one clear main scene. Avoid text, captions, logos, or watermarks.'
	]
		.filter(Boolean)
		.join('\n');
}

export function imageToStoryPrompt(prompt: string) {
	return `Create a short, exciting, and creative story for a young reader based on the following idea: "${prompt}". The story should be about 5 minutes to read and include a positive life lesson.`;
}

export function parseNewStoryOutput(text: string) {
	const parts = text.trim().split('\n');
	const story = parts.slice(0, -1).join('\n').trim();
	const imagePrompt = parts.at(-1)?.trim() ?? '';
	if (
		parts.length < 2 ||
		story.length < 100 ||
		imagePrompt.length < 10 ||
		Buffer.byteLength(story) > 100_000 ||
		Buffer.byteLength(imagePrompt) > 16_000
	)
		throw new InvalidStoryOutput();
	return { story, imagePrompt };
}

export function parseImageStoryOutput(text: string) {
	const story = text.trim();
	if (story.length < 100 || Buffer.byteLength(story) > 100_000) throw new InvalidStoryOutput();
	return story;
}
