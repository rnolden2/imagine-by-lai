import { z } from 'zod';
import { concepts, subjects } from './taxonomy.ts';

const slug = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.max(90);
const prose = z.string().trim().min(8).max(1500);
export const activitySchema = z
	.object({
		id: slug,
		title: z.string().trim().min(8).max(100),
		question: prose,
		summary: prose,
		subject: z.enum(subjects.map((s) => s.id)),
		concepts: z
			.array(z.enum(concepts.map((c) => c.id)))
			.min(2)
			.max(5),
		kind: z.enum(['experiment', 'observation', 'build']),
		ageMin: z.number().int().min(5).max(10),
		ageMax: z.number().int().min(5).max(10),
		setting: z.enum(['indoor', 'outdoor', 'either']),
		activeMinutes: z.number().int().min(5).max(180),
		waitMinutes: z.number().int().min(0).max(43200),
		adult: z.enum(['nearby', 'help', 'demonstration']),
		materials: z
			.array(
				z
					.object({
						name: z.string().trim().min(2).max(90),
						quantity: z.string().trim().min(1).max(80)
					})
					.strict()
			)
			.min(2)
			.max(12),
		steps: z.array(prose).min(3).max(10),
		prediction: prose,
		observe: prose,
		explanation: prose,
		fairTest: prose,
		safety: z.array(prose).min(1).max(8),
		younger: prose,
		older: prose,
		sources: z
			.array(
				z
					.object({
						title: z.string().min(3).max(200),
						// Structured Outputs supports pattern, but not JSON Schema's URI format.
						// Complete URL parsing happens in validateRecord below.
						url: z.string().regex(/^https:\/\/[^\s]+$/)
					})
					.strict()
			)
			.max(5)
	})
	.strict();
export type Activity = z.infer<typeof activitySchema>;

export const recordSchema = z
	.object({
		activity: activitySchema,
		status: z.enum(['starter', 'draft', 'reviewed', 'rejected']),
		provenance: z
			.object({
				origin: z.enum(['starter', 'ai']),
				model: z.string().nullable(),
				responseId: z.string().nullable(),
				createdAt: z.string().datetime(),
				promptVersion: z.string()
			})
			.strict(),
		review: z
			.object({
				by: z.string().trim().min(2),
				at: z.string().datetime(),
				notes: prose,
				contentHash: z.string().regex(/^[a-f0-9]{64}$/)
			})
			.strict()
			.nullable()
	})
	.strict();
export type CatalogRecord = z.infer<typeof recordSchema>;

export function validateRecord(input: unknown): CatalogRecord {
	const record = recordSchema.parse(input);
	const a = record.activity;
	for (const source of a.sources) {
		const url = new URL(source.url);
		if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
			throw new Error(`${a.id}: source must be an HTTPS URL without embedded credentials`);
		}
	}
	if (a.ageMin > a.ageMax) throw new Error(`${a.id}: ageMin exceeds ageMax`);
	if (new Set(a.concepts).size !== a.concepts.length) throw new Error(`${a.id}: repeated concepts`);
	if (new Set(a.materials.map((m) => normalize(m.name))).size !== a.materials.length)
		throw new Error(`${a.id}: repeated materials`);
	if (record.status === 'starter' && record.provenance.origin !== 'starter')
		throw new Error('AI content cannot become starter content');
	if (record.status === 'reviewed' && !record.review)
		throw new Error('Reviewed content requires a review record');
	return record;
}

export function normalize(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
export function validateCatalog(input: unknown): CatalogRecord[] {
	const records = z.array(z.unknown()).max(5000).parse(input).map(validateRecord);
	const ids = new Set<string>();
	const titles = new Set<string>();
	for (const { activity: a } of records) {
		if (ids.has(a.id) || titles.has(normalize(a.title)))
			throw new Error(`Duplicate activity: ${a.id}`);
		ids.add(a.id);
		titles.add(normalize(a.title));
	}
	return records;
}
