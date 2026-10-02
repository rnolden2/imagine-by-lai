import { requireGames } from '$lib/server/games/common';
export const load = () => {
	requireGames();
	return {};
};
