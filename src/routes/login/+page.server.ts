import {
	createAdminSession,
	passwordsMatch,
	ADMIN_SESSION_SECONDS
} from '#lib/server/admin-session';
import { dev } from '$app/env';
import { resolve } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_PASSWORD } from '#lib/server/secrets';
import { limit } from '#lib/server/games/common';
import { isHttpError } from '@sveltejs/kit';

export const load: PageServerLoad = () => {
	// Always show the passcode form so settings stays locked behind an explicit unlock step.
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = data.get('password');

		if (ADMIN_PASSWORD.length < 12)
			return fail(503, {
				error:
					'Admin access is not configured securely. Ask the administrator to set a password of at least 12 characters.'
			});

		try {
			// Shared by every server instance, including across Cloud Run restarts.
			await limit('app:login', 30, 300);
		} catch (cause) {
			if (isHttpError(cause) && cause.status === 429)
				return fail(429, { error: 'Too many login attempts. Please wait five minutes.' });
			return fail(503, { error: 'Login is temporarily unavailable. Please try again shortly.' });
		}
		if (passwordsMatch(password, ADMIN_PASSWORD)) {
			// Set a secure, http-only cookie to represent the session
			cookies.set('session', createAdminSession(ADMIN_PASSWORD), {
				maxAge: ADMIN_SESSION_SECONDS,
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: !dev
			});
			// Redirect to the settings page on successful login
			throw redirect(303, resolve('/settings'));
		}

		return fail(401, { error: 'Invalid password.' });
	}
};
