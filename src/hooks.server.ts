import type { Handle, HandleServerError } from '@sveltejs/kit';
import { SupabaseConnectionError } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = event.cookies.get('session');
	if (session === 'admin') {
		event.locals.user = { isAdmin: true };
	}

	// Secure the /settings routes to prevent kids from accessing admin controls
	if (event.url.pathname.startsWith('/settings') && !event.locals.user?.isAdmin) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof SupabaseConnectionError) {
		console.error('[supabase]', error.message, error.cause ?? '');
		return {
			code: 'SUPABASE_CONNECTION',
			title: 'Database connection problem',
			message: error.publicMessage,
			retryable: true,
			help: [
				'Check that the deployed secrets include supabase_url and supabase_service_role_key.',
				'Confirm the Supabase URL starts with https:// and ends with .supabase.co.',
				'Use a server-only service role key. Do not use a browser publishable key for server writes.',
				'If the database was just created, run the schema SQL manually in the Supabase SQL Editor.'
			]
		};
	}

	return {
		code: 'SERVER_ERROR',
		title: 'Something went wrong',
		message: 'An unexpected server error occurred.'
	};
};
