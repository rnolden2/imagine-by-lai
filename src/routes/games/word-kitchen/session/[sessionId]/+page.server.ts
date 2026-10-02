import { requireGames } from '$lib/server/games/common';
import { sessionRow, envelope } from '$lib/server/games/sessions';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
	requireGames();
	return { session: await envelope(await sessionRow(event, event.params.sessionId)) };
};
