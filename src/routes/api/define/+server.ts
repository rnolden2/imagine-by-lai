import { generateWordDefinition } from '#lib/server/ai';
import { json } from '@sveltejs/kit';
import { access } from '#lib/server/games/authorization';
import { limit } from '#lib/server/games/common';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const scope = await access(event);
	const word = event.url.searchParams.get('word')?.trim();

	if (!word || word.length > 80 || !/^[\p{L}\p{M}' -]+$/u.test(word)) {
		return json({ error: 'Provide a word of at most 80 characters.' }, { status: 400 });
	}
	await limit(`app:definitions:${scope.deviceId ?? 'parent'}`, 30, 60);
	await limit('app:definitions:day', 1000, 86400);

	try {
		return json(await generateWordDefinition(word));
	} catch {
		console.error('definition.failed', { requestId: event.locals.requestId });
		return json({ error: 'Definitions are temporarily unavailable.' }, { status: 503 });
	}
};
