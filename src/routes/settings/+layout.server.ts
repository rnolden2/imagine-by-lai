import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// Protect all routes under /settings
	if (!locals.user?.isAdmin) {
		throw redirect(303, '/login');
	}
};
