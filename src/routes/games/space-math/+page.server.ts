import { loadMathPractice } from '#lib/server/math-practice';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = loadMathPractice;
