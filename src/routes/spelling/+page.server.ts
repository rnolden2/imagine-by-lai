import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { error as kitError } from '@sveltejs/kit';
import { GRADE_WORD_LISTS } from '$lib/server/spelling-words';
import type { PageServerLoad } from './$types';
import type { SpellingWord, User } from '$lib/types';

export const load: PageServerLoad = async () => {
	let usersResult: any[] | null = null;
	let customWords: any[] | null = null;

	try {
		const supabase = await getSupabase();
		const [usersResponse, wordsResponse] = await Promise.all([
			supabase.from('child_profiles').select('*').order('name', { ascending: true }),
			supabase
				.from('spelling_words')
				.select('*')
				.order('grade', { ascending: true })
				.order('word', { ascending: true })
		]);

		if (usersResponse.error) throwSupabaseError('loading child profiles', usersResponse.error);
		if (wordsResponse.error) throwSupabaseError('loading spelling words', wordsResponse.error);
		usersResult = usersResponse.data;
		customWords = wordsResponse.data;
	} catch (error) {
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	const users = (usersResult ?? []).map((user) => ({ ...user, user_id: user.id })) as unknown as User[];

	return {
		users,
		customWords: (customWords ?? []) as unknown as SpellingWord[],
		gradeWordLists: GRADE_WORD_LISTS
	};
};
