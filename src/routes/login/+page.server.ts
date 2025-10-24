import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_PASSWORD } from '$lib/server/secrets';

export const load: PageServerLoad = ({ locals }) => {
	// If the user is already logged in, redirect them to the settings page
	if (locals.user?.isAdmin) {
		throw redirect(303, '/settings');
	}
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
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * 7 // 1 week
			});
			// Redirect to the settings page on successful login
			throw redirect(303, '/settings');
		}

		return fail(401, { error: 'Invalid password.' });
	}
};
