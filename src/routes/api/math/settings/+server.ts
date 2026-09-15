import { getSupabase, throwSupabaseError } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The public practice page already reads these settings. Writes remain admin-only.
export const GET: RequestHandler = async () => {
	const headers = { 'Cache-Control': 'no-store' };
	try {
		const supabase = await getSupabase();
		const { data, error } = await supabase
			.from('math_settings')
			.select('id, child_id, operations, config, updated_at')
			.order('child_id', { ascending: true });
		if (error) throwSupabaseError('refreshing math settings', error);
		return json({ mathSettings: data ?? [] }, { headers });
	} catch (error) {
		console.error('Failed to refresh math settings:', error);
		return json({ error: 'Math settings could not be refreshed.' }, { status: 503, headers });
	}
};
