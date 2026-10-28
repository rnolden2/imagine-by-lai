import { generateProblem, type Problem, type Settings } from '#lib/math';

function shuffle<T>(values: T[]): T[] {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/** Keep the shared curriculum and add tap-to-answer choices for arithmetic. */
export function generateSpaceProblem(settings: Settings): Problem & { choices: string[] } {
	const problem = generateProblem(settings);
	const answer = Number(problem.answer);
	const alternatives = problem.choices
		? problem.choices.filter((choice) => choice !== problem.answer)
		: [answer - 2, answer - 1, answer + 1, answer + 2].filter((value) => value >= 0).map(String);
	return {
		...problem,
		choices: shuffle([problem.answer, ...shuffle(alternatives).slice(0, 2)])
	};
}

export function problemHint(problem: Problem): string {
	const a = problem.num1 ?? 0;
	const b = problem.num2 ?? 0;
	switch (problem.op) {
		case 'addition':
			return `Start at ${Math.max(a, b)} and add ${Math.min(a, b)} more. ${Math.min(a, b) <= 10 ? 'Count forward one step at a time.' : 'Break the number you are adding into smaller parts, like tens and ones.'}`;
		case 'subtraction':
			return `Start at ${a} and take away ${b}. ${b <= 10 ? 'Count backward one step at a time.' : 'Break the number you are taking away into smaller parts, like tens and ones.'}`;
		case 'multiplication':
			return `Imagine ${a} groups with ${b} stars in each. Count by ${b}, or add ${b} once for each group.`;
		case 'division':
			return `Share ${a} stars equally among ${b} groups. How many stars go in each group? Think: ${b} × what number = ${a}?`;
		case 'fractions':
			return `Count the glowing parts for the top number. Count all ${problem.state.denominator} equal parts for the bottom number.`;
		case 'time':
			return 'The short hand tells the hour. Start at 12 and count by 5 around the clock for the long hand’s minutes. At 12, the minutes are 00.';
		case 'number-recognition':
			return 'Count each star once, from left to right. The last number you say is how many stars there are.';
	}
}

export const PLANETS = [
	{ name: 'Moonbeam', color: '#a5b4fc', detail: 'A lavender world with sparkling craters.' },
	{ name: 'Peach', color: '#fdba74', detail: 'A warm little planet with golden clouds.' },
	{ name: 'Lagoon', color: '#67e8f9', detail: 'A blue world full of quiet oceans.' },
	{ name: 'Clover', color: '#86efac', detail: 'A green planet with forests to explore.' },
	{ name: 'Rose', color: '#f9a8d4', detail: 'A rosy world beneath a sky full of stars.' }
] as const;
