import { gamesEnabled } from '$lib/server/games/common';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// Pass the user's session information to all pages
	return {
		user: locals.user,
        gamesEnabled: gamesEnabled()
	};
};
