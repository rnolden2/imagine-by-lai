import { sessionRow, envelope } from '$lib/server/games/sessions';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
	return { session: await envelope(await sessionRow(event, event.params.sessionId)) };
};
