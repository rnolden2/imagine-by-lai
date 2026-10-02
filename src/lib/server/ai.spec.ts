import { beforeEach, expect, it, vi } from 'vitest';

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
	for (const key of Object.keys(mocks.env)) delete mocks.env[key];
	mocks.openaiKey.mockResolvedValue('test-openai-key');
	mocks.geminiKey.mockResolvedValue('test-gemini-key');
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
		{ timeout: 85_000 }
	);
	expect(mocks.responses.mock.calls[0][0].model).toBe('configured-text-model');
});

it('rejects missing or invalid image bytes instead of saving corrupt images', async () => {
	const { generateStoryImage } = await import('./ai');
	mocks.images.mockResolvedValueOnce({ data: [] });
	await expect(generateStoryImage('A puppy')).rejects.toThrow('no image data');
	mocks.images.mockResolvedValueOnce({ data: [{ b64_json: 'bm90LWFuLWltYWdl' }] });
	await expect(generateStoryImage('A puppy')).rejects.toThrow('invalid PNG');
});

it('does not switch providers on errors or accept incomplete text', async () => {
	const { generateStoryText } = await import('./ai');
	mocks.responses.mockRejectedValueOnce(new Error('Provider unavailable'));
	await expect(generateStoryText('A story')).rejects.toThrow('Provider unavailable');
	mocks.responses.mockResolvedValueOnce({ status: 'incomplete', output_text: 'Partial story' });
	await expect(generateStoryText('A story')).rejects.toThrow('did not complete');
	mocks.responses.mockResolvedValueOnce({ status: 'completed', output_text: ' ' });
	await expect(generateStoryText('A story')).rejects.toThrow('empty text');
	expect(mocks.gemini).not.toHaveBeenCalled();
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
	await expect(generateWordDefinition('cat')).rejects.toThrow('invalid word definition');
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
