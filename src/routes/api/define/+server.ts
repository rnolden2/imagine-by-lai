import { generateWordDefinition } from '$lib/server/ai';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
	const word = url.searchParams.get('word');

	if (!word) {
		return json({ error: 'Word parameter is missing' }, { status: 400 });
	}

	try {
		return json(await generateWordDefinition(word));
	} catch (error) {
		console.error('Failed to get definition:', error);
		return json({ error: 'Failed to fetch definition' }, { status: 500 });
	}
}
