import { verifyAdminSession } from '#lib/server/admin-session';
import { ADMIN_PASSWORD } from '#lib/server/secrets';
import { randomUUID } from 'node:crypto';
import { authorizeRequest } from '#lib/server/application-security';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { SupabaseConnectionError } from '#lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	event.setHeaders({
		'X-Request-ID': event.locals.requestId,
		'X-Content-Type-Options': 'nosniff',
		// Preserve Origin on same-origin native POST forms while hiding external referrers.
		'Referrer-Policy': 'same-origin',
		'X-Frame-Options': 'DENY',
		'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin',
		'Permissions-Policy':
			'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
		'Cache-Control': 'private, no-store'
	});
	const session = event.cookies.get('session');
	if (ADMIN_PASSWORD.length >= 12 && verifyAdminSession(session, ADMIN_PASSWORD)) {
		event.locals.user = { isAdmin: true };
	}

	await authorizeRequest(event);

	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event, kind }) => {
	// Kit 3 also invokes this hook for intentional HTTP errors. Preserve their
	// safe public messages and avoid reporting rejected requests as server faults.
	if (kind !== 'unknown') {
		if (error.status >= 500) {
			console.error('request.failed', {
				requestId: event.locals.requestId,
				route: event.route.id,
				status: error.status,
				kind,
				code: 'HTTP_ERROR'
			});
		}
		return;
	}
	console.error('request.failed', {
		requestId: event.locals.requestId,
		route: event.route.id,
		status: error instanceof SupabaseConnectionError ? 503 : 500,
		kind,
		code: error instanceof SupabaseConnectionError ? 'DATABASE_UNAVAILABLE' : 'SERVER_ERROR'
	});
	if (error instanceof SupabaseConnectionError) {
		return {
			status: 503,
			code: 'SUPABASE_CONNECTION',
			title: 'Database connection problem',
			message: error.publicMessage,
			retryable: true,
			help: ['Please try again shortly. A parent can contact the administrator if this continues.']
		};
	}

	return {
		code: 'SERVER_ERROR',
		title: 'Something went wrong',
		message: 'An unexpected server error occurred.'
	};
};
