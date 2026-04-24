import { getDb } from '$lib/server/db';
import { GRADE_WORD_LISTS } from '$lib/server/spelling-words';
import type { PageServerLoad } from './$types';
import type { User, SpellingWord } from '$lib/types';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const customWords = db.prepare('SELECT * FROM spelling_words ORDER BY grade, word').all() as SpellingWord[];

	return { users, customWords, gradeWordLists: GRADE_WORD_LISTS };
};
