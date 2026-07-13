import OpenAI from 'openai';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { getGeminiApiKey, getOpenAIApiKey } from '$lib/server/secrets';

let openaiClient: OpenAI | null = null;
let geminiTextModel: GenerativeModel | null = null;
let geminiImageModel: GenerativeModel | null = null;

async function getOpenAIClient(): Promise<OpenAI> {
	if (openaiClient) return openaiClient;
	openaiClient = new OpenAI({ apiKey: await getOpenAIApiKey() });
	return openaiClient;
}

export async function getGeminiTextModel(): Promise<GenerativeModel> {
	if (geminiTextModel) return geminiTextModel;
	const genAI = new GoogleGenerativeAI(await getGeminiApiKey());
	geminiTextModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
	return geminiTextModel;
}

export async function getGeminiImageModel(): Promise<GenerativeModel> {
	if (geminiImageModel) return geminiImageModel;
	const genAI = new GoogleGenerativeAI(await getGeminiApiKey());
	geminiImageModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
	return geminiImageModel;
}

export async function generateStoryText(prompt: string): Promise<string> {
	try {
		const client = await getOpenAIClient();
		const response = await client.responses.create({
			model: 'gpt-5.1',
			input: prompt
		});

		if (!response.output_text?.trim()) {
			throw new Error('OpenAI returned an empty story response.');
		}

		return response.output_text;
	} catch (openAiError) {
		console.warn('OpenAI story generation failed; falling back to Gemini.', openAiError);
		const model = await getGeminiTextModel();
		const result = await model.generateContent(prompt);
		return result.response.text();
	}
}
