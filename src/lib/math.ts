export const MATH_OPERATIONS = [
	'addition',
	'subtraction',
	'multiplication',
	'division',
	'fractions',
	'time',
	'number-recognition'
] as const;
export const NUMBER_RANGES = [10, 20, 100, 1000] as const;
export const MINUTE_STEPS = [5, 15, 30, 60] as const;
export type Operation = (typeof MATH_OPERATIONS)[number];
export type Settings = {
	operations: Operation[];
	maxNumber: number;
	denominators: number[];
	minuteStep: number;
	recognitionMax: number;
};
export type Problem = {
	op: Operation;
	prompt: string;
	answer: string;
	choices?: string[];
	state: Record<string, unknown>;
	symbol?: string;
	num1?: number;
	num2?: number;
};
const SYMBOLS: Record<string, string> = {
	addition: '+',
	subtraction: '-',
	multiplication: 'x',
	division: '/'
};
const SHAPES = ['star', 'dot', 'heart'];
export function isOperation(value: unknown): value is Operation {
	return typeof value === 'string' && MATH_OPERATIONS.includes(value as Operation);
}
export function normalizeOps(value: unknown): Operation[] {
	const raw = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.trim().replace(/^\{/, '').replace(/\}$/, '').split(',')
			: [];
	return [
		...new Set(
			raw
				.filter((op): op is string => typeof op === 'string')
				.map((op) => op.trim().replace(/^"|"$/g, ''))
		)
	].filter(isOperation);
}
function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function resolveMathSettings(
	grade: string,
	saved?: { operations?: unknown; config?: unknown; max_number?: unknown }
): Settings {
	const early = ['TK', 'K', '1'].includes(grade);
	const defaults: Operation[] = ['TK', 'K'].includes(grade)
		? ['number-recognition', 'addition']
		: grade === '1'
			? ['addition', 'subtraction', 'time']
			: grade === '2'
				? ['addition', 'subtraction', 'fractions', 'time']
				: ['addition', 'subtraction', 'multiplication', 'division', 'fractions', 'time'];
	const config = record(saved?.config);
	const rawMax = Number(config.maxNumber ?? saved?.max_number);
	const maxNumber = NUMBER_RANGES.includes(rawMax as 10) ? rawMax : early ? 10 : 100;
	const ops = normalizeOps(saved?.operations);
	const fractions = record(config.fractions);
	const denominators = Array.isArray(fractions.denominators)
		? [
				...new Set(
					fractions.denominators.filter(
						(n): n is number => Number.isInteger(n) && Number(n) >= 2 && Number(n) <= 12
					)
				)
			]
		: [];
	const step = Number(record(config.time).minuteStep);
	const recognitionMax = Number(record(config.recognition).maxNumber);
	return {
		operations: ops.length ? ops : defaults,
		maxNumber,
		denominators: denominators.length ? denominators : [2, 3, 4, 6, 8],
		minuteStep: MINUTE_STEPS.includes(step as 5) ? step : 15,
		recognitionMax:
			Number.isInteger(recognitionMax) && recognitionMax >= 2 && recognitionMax <= 20
				? recognitionMax
				: Math.min(maxNumber, 20)
	};
}
function randomInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffled<T>(values: T[]) {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) {
		const j = randomInt(0, i);
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

function makeChoices(answer: string, distractors: string[]) {
	return shuffled([
		answer,
		...shuffled([...new Set(distractors)].filter((value) => value !== answer)).slice(0, 3)
	]);
}

function generateArithmetic(op: Operation, settings: Settings): Problem {
	const max = settings.maxNumber;
	let num1 = randomInt(1, max);
	let num2 = randomInt(1, max);
	let answer = num1 + num2;

	if (op === 'subtraction') {
		num1 = randomInt(2, max);
		num2 = randomInt(1, num1 - 1);
		answer = num1 - num2;
	} else if (op === 'multiplication') {
		const cap = Math.min(max, 12);
		num1 = randomInt(1, cap);
		num2 = randomInt(1, cap);
		answer = num1 * num2;
	} else if (op === 'division') {
		const cap = Math.min(max, 12);
		num2 = randomInt(1, cap);
		answer = randomInt(1, cap);
		num1 = num2 * answer;
	}

	return {
		op,
		prompt: 'What is the answer?',
		answer: String(answer),
		state: { num1, num2 },
		symbol: SYMBOLS[op],
		num1,
		num2
	};
}

function generateNumberRecognition(settings: Settings): Problem {
	const max = settings.recognitionMax;
	const number = randomInt(1, max);
	const choices = makeChoices(
		String(number),
		Array.from({ length: max }, (_, i) => String(i + 1))
	);

	return {
		op: 'number-recognition',
		prompt: 'Which number matches this group?',
		answer: String(number),
		choices,
		state: { number, choices, visualType: SHAPES[randomInt(0, SHAPES.length - 1)] }
	};
}

function generateFraction(settings: Settings): Problem {
	const denominator = settings.denominators[randomInt(0, settings.denominators.length - 1)];
	const numerator = randomInt(1, denominator - 1);
	const answer = `${numerator}/${denominator}`;

	return {
		op: 'fractions',
		prompt: 'What fraction is shaded?',
		answer,
		choices: makeChoices(
			answer,
			Array.from({ length: denominator + 1 }, (_, n) => `${n}/${denominator}`)
		),
		state: { numerator, denominator, shadingPattern: 'pie' }
	};
}

function generateTime(settings: Settings): Problem {
	const hour = randomInt(1, 12);
	const minute = randomInt(0, 60 / settings.minuteStep - 1) * settings.minuteStep;
	const answer = `${hour}:${String(minute).padStart(2, '0')}`;

	return {
		op: 'time',
		prompt: 'What time is shown?',
		answer,
		choices: makeChoices(
			answer,
			Array.from({ length: 12 }, (_, i) => `${i + 1}:${String(minute).padStart(2, '0')}`)
		),
		state: { hour, minute }
	};
}

export function generateProblem(settings: Settings): Problem {
	const ops: Operation[] = settings.operations.length ? settings.operations : ['addition'];
	const op = ops[randomInt(0, ops.length - 1)];

	if (op === 'number-recognition') return generateNumberRecognition(settings);
	if (op === 'fractions') return generateFraction(settings);
	if (op === 'time') return generateTime(settings);
	return generateArithmetic(op, settings);
}
