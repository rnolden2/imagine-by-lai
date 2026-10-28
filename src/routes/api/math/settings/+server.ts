import { getSupabase, throwSupabaseError } from '#lib/server/db';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { access } from '#lib/server/games/authorization';

// Scope refreshes to the same children as the authorized practice page.
export const GET: RequestHandler = async (event) => {
	const scope = await access(event);
	const headers = { 'Cache-Control': 'no-store' };
	try {
		const supabase = await getSupabase();
		const { data, error } = await supabase
			.from('math_settings')
			.select('id, child_id, operations, config, updated_at')
			.in('child_id', scope.childIds)
			.order('child_id', { ascending: true });
		if (error) throwSupabaseError('refreshing math settings', error);
		return json({ mathSettings: data ?? [] }, { headers });
	} catch {
		console.error('math.settings.refresh.failed', { requestId: event.locals.requestId });
		return json({ error: 'Math settings could not be refreshed.' }, { status: 503, headers });
	}
};
