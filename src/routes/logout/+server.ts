import { resolve } from '$app/paths';
import { redirect, type RequestHandler } from '@sveltejs/kit';
import { requireOrigin } from '#lib/server/request';

export const POST: RequestHandler = (event) => {
	requireOrigin(event);
	event.cookies.delete('session', { path: '/' });
	redirect(303, resolve('/'));
};
