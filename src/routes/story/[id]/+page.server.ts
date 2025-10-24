import { getDb } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Story } from '$lib/types';

export const load: PageServerLoad = ({ params }) => {
	const db = getDb();
	const stmt = db.prepare('SELECT * FROM stories WHERE id = ?');
	const story = stmt.get(params.id) as Story | undefined;

	if (!story) {
		throw error(404, 'Story not found');
	}

	return {
		story
	};
};
