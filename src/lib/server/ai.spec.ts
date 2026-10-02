import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: {} as Record<string, string>,
	responses: vi.fn(),
	images: vi.fn(),
	gemini: vi.fn(),
	openaiKey: vi.fn(),
	geminiKey: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/secrets', () => ({
	getOpenAIApiKey: mocks.openaiKey,
	getGeminiApiKey: mocks.geminiKey
}));
vi.mock('openai', () => ({
	default: class {
		responses = { create: mocks.responses };
		images = { generate: mocks.images };
	}
}));
vi.mock('@google/generative-ai', () => ({
	GoogleGenerativeAI: class {
		getGenerativeModel() {
			return { generateContent: mocks.gemini };
		}
	}
}));

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	for (const key of Object.keys(mocks.env)) delete mocks.env[key];
	mocks.openaiKey.mockResolvedValue('test-openai-key');
	mocks.geminiKey.mockResolvedValue('test-gemini-key');
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it('defaults to OpenAI for stories, including image-based stories, without loading Gemini credentials', async () => {
	mocks.responses.mockResolvedValue({ status: 'completed', output_text: 'A story.' });
	const { generateStoryText } = await import('./ai');
	expect(await generateStoryText('Tell a story')).toBe('A story.');
	expect(await generateStoryText('Use this picture', png)).toBe('A story.');
	expect(mocks.responses.mock.calls[0][0]).toMatchObject({
		model: 'gpt-5.1',
		input: 'Tell a story',
		store: false
	});
	expect(mocks.responses.mock.calls[1][0].input[0].content[1]).toMatchObject({
		type: 'input_image',
		image_url: `data:image/png;base64,${png.toString('base64')}`
	});
	expect(mocks.openaiKey).toHaveBeenCalledOnce();
	expect(mocks.geminiKey).not.toHaveBeenCalled();
});

it('returns PNG bytes for storage and honors configured OpenAI models', async () => {
	mocks.env.OPENAI_IMAGE_MODEL = 'gpt-image-1.5';
	mocks.env.OPENAI_TEXT_MODEL = 'configured-text-model';
	mocks.images.mockResolvedValue({ data: [{ b64_json: png.toString('base64') }] });
	mocks.responses.mockResolvedValue({ status: 'completed', output_text: 'A story.' });
	const { generateStoryImage, generateStoryText } = await import('./ai');
	expect(await generateStoryImage('A puppy')).toEqual(png);
	await generateStoryText('A puppy');
	expect(mocks.images).toHaveBeenCalledWith(
		expect.objectContaining({ model: 'gpt-image-1.5', n: 1, output_format: 'png' }),
		{ timeout: 42_500 }
	);
	expect(mocks.responses.mock.calls[0][0].model).toBe('configured-text-model');
});

it('rejects missing or invalid image bytes instead of saving corrupt images', async () => {
	const { generateStoryImage } = await import('./ai');
	mocks.gemini.mockResolvedValue({ response: { candidates: [] } });
	mocks.images.mockResolvedValueOnce({ data: [] });
	await expect(generateStoryImage('A puppy')).rejects.toThrow('AI_PROVIDERS_FAILED');
	mocks.images.mockResolvedValueOnce({ data: [{ b64_json: 'bm90LWFuLWltYWdl' }] });
	await expect(generateStoryImage('A puppy')).rejects.toThrow('AI_PROVIDERS_FAILED');
});

it('falls back for provider failures and incomplete or empty text', async () => {
	const { generateStoryText } = await import('./ai');
	mocks.gemini.mockResolvedValue({ response: { text: () => 'Gemini story' } });
	mocks.responses.mockRejectedValueOnce(new Error('Provider unavailable'));
	expect(await generateStoryText('A story')).toBe('Gemini story');
	mocks.responses.mockResolvedValueOnce({ status: 'incomplete', output_text: 'Partial story' });
	expect(await generateStoryText('A story')).toBe('Gemini story');
	mocks.responses.mockResolvedValueOnce({ status: 'completed', output_text: ' ' });
	expect(await generateStoryText('A story')).toBe('Gemini story');
	expect(mocks.gemini).toHaveBeenCalledTimes(3);
});

it('requests structured definitions and rejects invalid definition content', async () => {
	const { generateWordDefinition } = await import('./ai');
	mocks.responses.mockResolvedValueOnce({
		status: 'completed',
		output_text: '{"phonetic":"kat","definition":"A small furry animal."}'
	});
	expect(await generateWordDefinition('cat')).toEqual({
		phonetic: 'kat',
		definition: 'A small furry animal.'
	});
	expect(mocks.responses.mock.calls[0][0].text.format).toMatchObject({
		type: 'json_schema',
		strict: true
	});
	mocks.responses.mockResolvedValueOnce({ output_text: '{"phonetic":42,"definition":""}' });
	mocks.gemini.mockResolvedValue({ response: { text: () => '{"phonetic":42}' } });
	await expect(generateWordDefinition('cat')).rejects.toThrow('AI_PROVIDERS_FAILED');
});

it('switches all generation back to Gemini without accessing OpenAI credentials', async () => {
	mocks.env.AI_PROVIDER = 'gemini';
	const { generateStoryText, generateStoryImage, generateWordDefinition } = await import('./ai');
	mocks.gemini.mockResolvedValueOnce({ response: { text: () => 'Gemini story' } });
	expect(await generateStoryText('Use this picture', png)).toBe('Gemini story');
	expect(mocks.gemini.mock.calls[0][0][1].inlineData.data).toBe(png.toString('base64'));
	mocks.gemini.mockResolvedValueOnce({
		response: {
			candidates: [{ content: { parts: [{ inlineData: { data: png.toString('base64') } }] } }]
		}
	});
	expect(await generateStoryImage('A puppy')).toEqual(png);
	mocks.gemini.mockResolvedValueOnce({
		response: { text: () => '```json\n{"phonetic":"kat","definition":"An animal."}\n```' }
	});
	expect(await generateWordDefinition('cat')).toEqual({
		phonetic: 'kat',
		definition: 'An animal.'
	});
	expect(mocks.openaiKey).not.toHaveBeenCalled();
	expect(mocks.responses).not.toHaveBeenCalled();
	expect(mocks.images).not.toHaveBeenCalled();
});

it('rejects a misspelled provider before making an API call', async () => {
	mocks.env.AI_PROVIDER = 'invalid';
	const { generateStoryText } = await import('./ai');
	await expect(generateStoryText('A story')).rejects.toThrow('AI_PROVIDER');
	expect(mocks.openaiKey).not.toHaveBeenCalled();
	expect(mocks.geminiKey).not.toHaveBeenCalled();
});

it.each([
	'credit_balance_exhausted',
	'insufficient_quota',
	'rate_limit_exceeded',
	'organization_spend_limit_exceeded'
])('uses Gemini when OpenAI rejects with %s', async (code) => {
	const { generateStoryText } = await import('./ai');
	mocks.responses.mockRejectedValue(Object.assign(new Error('Private provider details'), { code }));
	mocks.gemini.mockResolvedValue({ response: { text: () => 'Fallback story' } });
	expect(await generateStoryText('Private prompt', png)).toBe('Fallback story');
	expect(mocks.responses).toHaveBeenCalledTimes(1);
	expect(mocks.gemini).toHaveBeenCalledTimes(1);
	expect(mocks.gemini.mock.calls[0][0][1].inlineData.data).toBe(png.toString('base64'));
	expect(console.warn).toHaveBeenCalledWith('ai.fallback', {
		operation: 'story_text',
		from: 'openai',
		to: 'gemini'
	});
});

it('falls back for images, definitions and kitchen planning while reporting asset provenance', async () => {
	const { generateStoryImage, generateWordDefinition, generateGamePlan, generateGameImage } =
		await import('./ai');
	mocks.images.mockRejectedValue(new Error('Unavailable'));
	mocks.responses.mockRejectedValue(new Error('Unavailable'));
	const geminiImage = {
		response: {
			candidates: [{ content: { parts: [{ inlineData: { data: png.toString('base64') } }] } }]
		}
	};
	mocks.gemini.mockResolvedValueOnce(geminiImage);
	expect(await generateStoryImage('Picture')).toEqual(png);
	mocks.gemini.mockResolvedValueOnce({
		response: { text: () => '{"phonetic":"kat","definition":"Animal"}' }
	});
	expect(await generateWordDefinition('cat')).toEqual({ phonetic: 'kat', definition: 'Animal' });
	const reserve = vi.fn().mockResolvedValue(undefined),
		onProvider = vi.fn();
	mocks.gemini.mockResolvedValueOnce({ response: { text: () => '{"supported":true}' } });
	expect(await generateGamePlan('Pizza', {}, { beforeFallback: reserve })).toEqual({
		supported: true
	});
	mocks.gemini.mockResolvedValueOnce(geminiImage);
	expect(await generateGameImage('Pizza', true, { beforeFallback: reserve, onProvider })).toEqual(
		png
	);
	expect(reserve).toHaveBeenCalledTimes(2);
	expect(onProvider).toHaveBeenCalledWith('gemini');
	expect(mocks.gemini.mock.calls[3][0]).toContain('transparent background');
});

it('stops before purchasing Gemini work if the kitchen fallback reservation is rejected', async () => {
	const { generateGameImage } = await import('./ai');
	mocks.images.mockRejectedValue(new Error('Unavailable'));
	const beforeFallback = vi.fn().mockRejectedValue(new Error('BUDGET_EXCEEDED'));
	await expect(generateGameImage('Pizza', true, { beforeFallback })).rejects.toThrow(
		'BUDGET_EXCEEDED'
	);
	expect(mocks.gemini).not.toHaveBeenCalled();
	expect(mocks.geminiKey).not.toHaveBeenCalled();
});

it('makes only one fallback attempt and returns a safe error when both providers fail', async () => {
	const { generateGamePlan } = await import('./ai');
	mocks.responses.mockRejectedValue(new Error('Private primary payload'));
	mocks.gemini.mockRejectedValue(new Error('Private fallback payload'));
	await expect(generateGamePlan('Pizza', {})).rejects.toThrow('AI_PROVIDERS_FAILED');
	expect(mocks.responses).toHaveBeenCalledTimes(1);
	expect(mocks.gemini).toHaveBeenCalledTimes(1);
});

it('does not use fallback to bypass an explicit model refusal', async () => {
	const { generateStoryText } = await import('./ai');
	mocks.responses.mockResolvedValue({
		status: 'completed',
		output_text: '',
		output: [{ type: 'message', content: [{ type: 'refusal' }] }]
	});
	await expect(generateStoryText('Prompt')).rejects.toThrow('AI_REQUEST_REFUSED');
	expect(mocks.gemini).not.toHaveBeenCalled();
});

it('leaves time for Gemini after an OpenAI timeout within the overall deadline', async () => {
	vi.useFakeTimers();
	const { generateGamePlan } = await import('./ai');
	mocks.responses.mockImplementation(async () => {
		vi.setSystemTime(Date.now() + 45_000);
		throw new Error('Timeout');
	});
	mocks.gemini.mockResolvedValue({ response: { text: () => '{}' } });
	expect(await generateGamePlan('Pizza', {})).toEqual({});
	expect(mocks.responses.mock.calls[0][1]).toEqual({ timeout: 45_000 });
	expect(mocks.gemini.mock.calls[0][1]).toEqual({ timeout: 45_000 });
});
