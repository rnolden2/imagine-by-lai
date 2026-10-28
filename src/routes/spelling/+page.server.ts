import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '#lib/server/db';
import { error as kitError } from '@sveltejs/kit';
import { GRADE_WORD_LISTS } from '#lib/server/spelling-words';
import type { PageServerLoad } from './$types';
import type { SpellingWord, User } from '#lib/types';
import { access } from '#lib/server/games/authorization';

type PracticeUser = Pick<User, 'id' | 'name' | 'grade' | 'gender'>;
type CustomSpellingWord = Pick<SpellingWord, 'id' | 'word' | 'grade'>;

export const load: PageServerLoad = async (event) => {
	const scope = await access(event);
	let usersResult: PracticeUser[] | null = null;
	let customWords: CustomSpellingWord[] | null = null;

	try {
		const supabase = await getSupabase();
		const usersResponse = await supabase
			.from('child_profiles')
			.select('id,name,grade,gender')
			.in('id', scope.childIds)
			.order('name', { ascending: true });
		if (usersResponse.error) throwSupabaseError('loading child profiles', usersResponse.error);
		usersResult = usersResponse.data;
		const grades = [...new Set((usersResult ?? []).map((user) => user.grade))];
		if (grades.length) {
			const wordsResponse = await supabase
				.from('spelling_words')
				.select('id,word,grade')
				.in('grade', grades)
				.order('grade', { ascending: true })
				.order('word', { ascending: true });
			if (wordsResponse.error) throwSupabaseError('loading spelling words', wordsResponse.error);
			customWords = wordsResponse.data;
		} else customWords = [];
	} catch (error) {
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	const users = (usersResult ?? []).map((user) => ({
		...user,
		user_id: user.id
	})) as unknown as User[];

	return {
		users,
		customWords: customWords ?? [],
		gradeWordLists: GRADE_WORD_LISTS
	};
};
