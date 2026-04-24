import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import type { User, MathSettings } from '$lib/types';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const mathSettings = db.prepare('SELECT * FROM math_settings').all() as MathSettings[];

	return { users, mathSettings };
};
