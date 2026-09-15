import { describe, expect, it } from 'vitest';
import {
	generateProblem,
	MATH_OPERATIONS,
	MINUTE_STEPS,
	NUMBER_RANGES,
	normalizeOps,
	resolveMathSettings
} from './math';
import { parseMathAttempt } from './server/math-attempt';

const sessionId = '12345678-1234-4567-89ab-123456789abc';
describe('math modes', () => {
	it('normalizes legacy settings and falls back safely for corrupt data', () => {
		expect(normalizeOps('{"time","addition","time",unknown}')).toEqual(['time', 'addition']);
		for (const value of [-10, 0, 1, 1.5, Infinity, 'bad', null]) {
			const settings = resolveMathSettings('2', { operations: [], config: { maxNumber: value } });
			expect(settings.maxNumber).toBe(100);
			expect(settings.operations).toContain('fractions');
		}
		expect(resolveMathSettings('K').operations).toEqual(['number-recognition', 'addition']);
		expect(resolveMathSettings('3', { operations: ['time'], max_number: 20 }).maxNumber).toBe(20);
	});
	for (const op of MATH_OPERATIONS) {
		it(`generates valid, answerable ${op} problems at every range`, () => {
			for (const maxNumber of NUMBER_RANGES) {
				const settings = resolveMathSettings('3', { operations: [op], config: { maxNumber } });
				for (let i = 0; i < 200; i++) {
					const problem = generateProblem(settings);
					expect(problem.op).toBe(op);
					const parsed = parseMathAttempt({
						childId: 1,
						sessionId,
						operation: op,
						problemState: problem.state,
						givenAnswer: problem.answer
					});
					expect(parsed?.is_correct).toBe(true);
					if (problem.choices) {
						expect(problem.choices).toContain(problem.answer);
						expect(new Set(problem.choices).size).toBe(problem.choices.length);
						expect(problem.choices.length).toBeGreaterThanOrEqual(3);
					}
					if (op === 'fractions') {
						const values = problem.choices!.map((choice) => {
							const [a, b] = choice.split('/').map(Number);
							return a / b;
						});
						expect(new Set(values).size).toBe(values.length);
					}
					if (op === 'addition' || op === 'subtraction') {
						expect(problem.num1).toBeLessThanOrEqual(maxNumber);
						expect(problem.num2).toBeLessThanOrEqual(maxNumber);
					}
				}
			}
		});
	}
	it('honors clock, fraction, and recognition configuration', () => {
		for (const minuteStep of MINUTE_STEPS) {
			const settings = resolveMathSettings('1', {
				operations: ['time'],
				config: { time: { minuteStep } }
			});
			for (let i = 0; i < 100; i++)
				expect(Number(generateProblem(settings).state.minute) % minuteStep).toBe(0);
		}
		const fractions = resolveMathSettings('2', {
			operations: ['fractions'],
			config: { fractions: { denominators: [3] } }
		});
		expect(generateProblem(fractions).state.denominator).toBe(3);
		const counting = resolveMathSettings('K', {
			operations: ['number-recognition'],
			config: { recognition: { maxNumber: 2 } }
		});
		expect(generateProblem(counting).choices?.sort()).toEqual(['1', '2']);
	});
	it('rejects malformed attempts and ignores client correctness claims', () => {
		const valid = {
			childId: 1,
			sessionId,
			operation: 'addition',
			problemState: { num1: 2, num2: 3 },
			givenAnswer: '4',
			correctAnswer: '4',
			isCorrect: true
		};
		expect(parseMathAttempt(valid)).toMatchObject({ correct_answer: '5', is_correct: false });
		for (const change of [
			{ childId: -1 },
			{ sessionId: 'fake' },
			{ operation: 'bad' },
			{ givenAnswer: {} },
			{ problemState: { num1: 1, num2: Infinity } }
		])
			expect(parseMathAttempt({ ...valid, ...change })).toBeNull();
		expect(parseMathAttempt(null)).toBeNull();
	});
});
