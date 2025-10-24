import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = event.cookies.get('session');

	if (session === 'admin') {
		event.locals.user = {
			isAdmin: true
		};
	}

	return resolve(event);
};
