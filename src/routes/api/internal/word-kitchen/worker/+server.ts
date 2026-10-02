import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { readBody } from '$lib/server/games/common';
import { runGeneration } from '$lib/server/games/generation';
import { verifyWorker, dispatchOutbox } from '$lib/server/games/queue';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (e) => {
	await verifyWorker(e);
	const b = await readBody(e, z.object({ jobId: z.string().uuid() }).strict());
	await runGeneration(b.jobId);
	await dispatchOutbox();
	return json({ ok: true });
};
