import { error, isHttpError, redirect, type RequestEvent } from '@sveltejs/kit';
import { access } from '#lib/server/games/authorization';
import { requireOrigin } from './request';
import { resolve } from '$app/paths';
import { requireGameRoute } from './game-availability';

/** Deny by default for new routes; only these non-personalized routes are public. */
export async function authorizeRequest(event: RequestEvent) {
	const route = event.route.id;
	if (!route) return; // Let SvelteKit return its normal 404.
	const internal = route.startsWith('/api/internal/');
	// Internal delivery endpoints independently verify Cloud Tasks OIDC.
	if (internal) return;
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) requireOrigin(event);
	requireGameRoute(route);
	if (
		route === '/login' ||
		route === '/logout' ||
		route === '/science' ||
		route === '/games' ||
		route === '/health/live' ||
		route === '/health/ready'
	)
		return;
	if (
		route === '/settings' ||
		route.startsWith('/settings/') ||
		route.startsWith('/api/settings/')
	) {
		if (!event.locals.user?.isAdmin) {
			if (route.startsWith('/api/')) error(403, 'Parent access required.');
			redirect(303, resolve('/login'));
		}
		return;
	}
	try {
		await access(event);
	} catch (cause) {
		if (isHttpError(cause) && cause.status === 403 && !route.startsWith('/api/'))
			redirect(303, resolve('/login'));
		throw cause;
	}
}
