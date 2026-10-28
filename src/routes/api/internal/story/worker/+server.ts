import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { readBody } from '#lib/server/request';
import { verifyWorker } from '#lib/server/worker';
import { dispatchStoryOutbox, runStoryJob } from '#lib/server/story-jobs';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await verifyWorker(event);
	const body = await readBody(event, z.object({ jobId: z.string().uuid() }).strict());
	await runStoryJob(body.jobId);
	await dispatchStoryOutbox();
	return json({ ok: true });
};
