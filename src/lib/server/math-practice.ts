import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { error as kitError } from '@sveltejs/kit';
import type { MathSettings, User } from '$lib/types';

export async function loadMathPractice() {
	let usersResult: User[] | null = null;
	let settingsResult: MathSettings[] | null = null;

	try {
		const supabase = await getSupabase();
		const [usersResponse, settingsResponse] = await Promise.all([
			supabase.from('child_profiles').select('*').order('name', { ascending: true }),
			supabase.from('math_settings').select('*').order('child_id', { ascending: true })
		]);

		if (usersResponse.error) throwSupabaseError('loading child profiles', usersResponse.error);
		if (settingsResponse.error) throwSupabaseError('loading math settings', settingsResponse.error);
		usersResult = usersResponse.data;
		settingsResult = settingsResponse.data;
	} catch (error) {
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	const users = (usersResult ?? []).map((user) => ({
		...user,
		user_id: user.id
	})) as unknown as User[];
	const mathSettings = (settingsResult ?? []).map((settings) => ({
		...settings,
		user_id: settings.child_id,
		config: settings.config ?? {}
	})) as unknown as MathSettings[];

	return { users, mathSettings };
}
