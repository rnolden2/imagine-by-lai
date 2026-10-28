import { z } from 'zod';

export const gradeSchema = z.enum(['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8']);
const schema = z.object({
	name: z.string().trim().min(1).max(120),
	grade: gradeSchema,
	gender: z.enum(['boy', 'girl']),
	character_description: z.string().trim().max(2000).nullable(),
	story_themes: z
		.array(z.string().trim().min(1).max(200))
		.max(10)
		.refine((values) => values.join(',').length <= 2000),
	story_length_minutes: z.union([z.literal(3), z.literal(5), z.literal(8), z.literal(10)])
});
export function parseProfile(form: FormData) {
	const themes = form.getAll('storyThemes');
	return schema.safeParse({
		name: form.get('name'),
		grade: form.get('grade'),
		gender: form.get('gender'),
		character_description: form.get('characterDescription') || null,
		story_themes: themes.length ? themes : ['space'],
		story_length_minutes: Number(form.get('storyLengthMinutes') ?? 5)
	});
}
export function parseId(value: unknown): number | null {
	if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}
