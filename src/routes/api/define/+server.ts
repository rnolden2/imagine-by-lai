import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { getGeminiApiKey } from '$lib/server/secrets';
import { json } from '@sveltejs/kit';

let model: GenerativeModel;

// Asynchronously initialize the Gemini model
async function getModel(): Promise<GenerativeModel> {
	if (model) {
		return model;
	}
	const apiKey = await getGeminiApiKey();
	const genAI = new GoogleGenerativeAI(apiKey);
	model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
	return model;
}

export async function GET({ url }) {
	const word = url.searchParams.get('word');

	if (!word) {
		return json({ error: 'Word parameter is missing' }, { status: 400 });
	}

	try {
		const definitionModel = await getModel();
		const prompt = `For the word "${word}", provide its phonetic spelling and a simple definition suitable for a 6-year-old. Return the response as a JSON object with two keys: "phonetic" and "definition".`;

		const result = await definitionModel.generateContent(prompt);
		const responseText = await result.response.text();

		// Clean the response to be valid JSON
		const cleanedJson = responseText.replace(/```json\n|\n```/g, '').trim();
		const data = JSON.parse(cleanedJson);

		return json(data);
	} catch (error) {
		console.error('Failed to get definition:', error);
		return json({ error: 'Failed to fetch definition' }, { status: 500 });
	}
}
