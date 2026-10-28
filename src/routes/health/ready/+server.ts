import { checkReadiness } from '#lib/server/health';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const result = await checkReadiness();
	if (!result.ok) {
		console.error('health.ready.failed', { requestId: locals.requestId, code: result.code });
		return json(
			{ status: 'unavailable' },
			{
				status: 503,
				headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
			}
		);
	}
	return json(
		{ status: 'ok' },
		{ headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
	);
};
