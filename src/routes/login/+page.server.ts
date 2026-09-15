import {
	createAdminSession,
	passwordsMatch,
	ADMIN_SESSION_SECONDS
} from '$lib/server/admin-session';
import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_PASSWORD } from '$lib/server/secrets';

export const load: PageServerLoad = () => {
	// Always show the passcode form so settings stays locked behind an explicit unlock step.
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = data.get('password');

		if (!ADMIN_PASSWORD)
			return fail(503, {
				error: 'Admin access is not configured. Set ADMIN_PASSWORD on the server.'
			});

		if (passwordsMatch(password, ADMIN_PASSWORD)) {
			// Set a secure, http-only cookie to represent the session
			cookies.set('session', createAdminSession(ADMIN_PASSWORD), {
				maxAge: ADMIN_SESSION_SECONDS,
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production'
			});
			// Redirect to the settings page on successful login
			throw redirect(303, `${base}/settings`);
		}

		return fail(401, { error: 'Invalid password.' });
	}
};
