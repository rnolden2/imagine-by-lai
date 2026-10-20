import type { Activity } from './contracts.ts';
import { conceptById, subjects } from './taxonomy.ts';

export type Filters = {
	query: string;
	subject: string;
	age: string;
	setting: string;
	minutes: string;
	adult: string;
	materials: string;
};
export const emptyFilters: Filters = {
	query: '',
	subject: '',
	age: '',
	setting: '',
	minutes: '',
	adult: '',
	materials: ''
};

export function matches(a: Activity, f: Filters): boolean {
	const text = [
		a.title,
		a.question,
		a.summary,
		...a.concepts.map((id) => conceptById.get(id)?.label ?? id)
	]
		.join(' ')
		.toLowerCase();
	const terms = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const materials = f.materials
		.toLowerCase()
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return (
		terms.every((term) => text.includes(term)) &&
		(!f.subject || a.subject === f.subject) &&
		(!f.age || (a.ageMin <= Number(f.age) && a.ageMax >= Number(f.age))) &&
		(!f.setting || a.setting === f.setting || a.setting === 'either') &&
		(!f.minutes || a.activeMinutes <= Number(f.minutes)) &&
		(!f.adult || a.adult === f.adult) &&
		materials.every((term) => a.materials.some((m) => m.name.toLowerCase().includes(term)))
	);
}

// Broad skills should not drown out the scientific reason for a connection.
const broad = new Set(['measurement', 'design', 'materials', 'scale']);
export function related(
	a: Activity,
	all: Activity[],
	mode: 'science' | 'materials' = 'science',
	limit = 6
) {
	return all
		.filter((b) => b.id !== a.id)
		.map((b) => {
			const shared =
				mode === 'science'
					? a.concepts.filter((c) => b.concepts.includes(c))
					: a.materials
							.map((m) => m.name.toLowerCase())
							.filter((name) => b.materials.some((m) => m.name.toLowerCase() === name));
			const score = shared.reduce(
				(sum, key) => sum + (mode === 'science' && broad.has(key) ? 0.2 : 1),
				0
			);
			return {
				activity: b,
				shared,
				score,
				reason:
					mode === 'science'
						? `Both explore ${shared.map((id) => conceptById.get(id)?.label.toLowerCase() ?? id).join(' and ')}.`
						: `Both use ${shared.join(', ')}.`
			};
		})
		.filter((r) => r.score >= 1)
		.sort((a, b) => b.score - a.score || a.activity.id.localeCompare(b.activity.id))
		.slice(0, limit);
}

export type Star = { activity: Activity; x: number; y: number };
export function layout(activities: Activity[]): Star[] {
	// Deterministic subject clusters: filters never reshuffle the constellation.
	return subjects.flatMap((subject) => {
		const group = activities
			.filter((a) => a.subject === subject.id)
			.sort((a, b) => a.id.localeCompare(b.id));
		return group.map((activity, i) => {
			const angle = i * 2.3999632297 + subjects.indexOf(subject);
			const radius = 4 + 10 * Math.sqrt((i + 0.5) / Math.max(group.length, 1));
			return {
				activity,
				x: subject.x + Math.cos(angle) * radius,
				y: subject.y + Math.sin(angle) * radius * 0.88
			};
		});
	});
}
