import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireOrigin, readBody, childIdSchema } from '$lib/server/games/common';
import { durationSchema } from '$lib/games/word-kitchen/contracts';
import { startSession } from '$lib/server/games/sessions';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
	requireOrigin(event);
	const b = await readBody(
		event,
		z
			.object({
				childId: childIdSchema,
				revisionId: z.string().uuid(),
				duration: durationSchema,
				key: z.string().uuid(),
				preview: z.boolean().default(false)
			})
			.strict()
	);
	return json(await startSession(event, b.childId, b.revisionId, b.duration, b.key, b.preview));
};
