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

		if (password === ADMIN_PASSWORD) {
			// Set a secure, http-only cookie to represent the session
			cookies.set('session', 'admin', {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production'
			});
			// Redirect to the settings page on successful login
			throw redirect(303, '/settings');
		}

		return fail(401, { error: 'Invalid password.' });
	}
};
