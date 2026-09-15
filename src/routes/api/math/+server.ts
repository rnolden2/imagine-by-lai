import { getSupabase, throwSupabaseError } from '$lib/server/db';
import { parseMathAttempt } from '$lib/server/math-attempt';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return json({ success: false }, { status: 403 });
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		return json({ success: false }, { status: 415 });
	let attempt;
	try {
		const body = await request.text();
		if (body.length > 8192) return json({ success: false }, { status: 413 });
		attempt = parseMathAttempt(JSON.parse(body));
	} catch {
		return json({ success: false, error: 'Invalid math attempt.' }, { status: 400 });
	}
	if (!attempt) return json({ success: false, error: 'Invalid math attempt.' }, { status: 400 });
	try {
		const supabase = await getSupabase();
		const { error } = await supabase.from('math_attempts').insert(attempt);
		if (error) throwSupabaseError('logging math attempt', error);
	} catch (error) {
		console.error('Failed to log math attempt:', error);
		return json({ success: false, error: 'Math history could not be saved.' }, { status: 503 });
	}
	return json({ success: true });
};
