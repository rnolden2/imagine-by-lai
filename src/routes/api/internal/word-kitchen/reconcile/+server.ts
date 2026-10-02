import { json } from '@sveltejs/kit';
import { verifyWorker, reconcile } from '$lib/server/games/queue';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (e) => {
	await verifyWorker(e);
	await reconcile();
	return json({ ok: true });
};
