import type { LayoutServerLoad } from './$types';
import { gameAvailability } from '#lib/server/game-availability';

export const load: LayoutServerLoad = ({ locals }) => {
	// Pass the user's session information to all pages
	return {
		user: locals.user,
		gameAvailability: gameAvailability()
	};
};
