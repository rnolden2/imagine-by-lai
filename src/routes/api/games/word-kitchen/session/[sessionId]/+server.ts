import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireOrigin, readBody } from '$lib/server/games/common';
import { eventSchema } from '$lib/games/word-kitchen/contracts';
import { sessionRow, envelope, submitEvent } from '$lib/server/games/sessions';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (e) => {
	const id = z.string().uuid().parse(e.params.sessionId);
	return json(await envelope(await sessionRow(e, id)), {
		headers: { 'Cache-Control': 'private,no-store' }
	});
};
export const POST: RequestHandler = async (e) => {
	requireOrigin(e);
	const id = z.string().uuid().parse(e.params.sessionId);
	return json(await submitEvent(e, id, await readBody(e, eventSchema)), {
		headers: { 'Cache-Control': 'private,no-store' }
	});
};
