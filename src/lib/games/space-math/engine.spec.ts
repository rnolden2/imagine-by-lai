import { describe, expect, it } from 'vitest';
import { MATH_OPERATIONS, NUMBER_RANGES, resolveMathSettings } from '$lib/math';
import { parseMathAttempt } from '$lib/server/math-attempt';
import { generateSpaceProblem, problemHint } from './engine';

describe('Space Math curriculum integration', () => {
	for (const operation of MATH_OPERATIONS) {
		it(`keeps saved ${operation} questions answerable and compatible with history`, () => {
			for (const maxNumber of NUMBER_RANGES) {
				const settings = resolveMathSettings('K', {
					operations: [operation],
					config: { maxNumber, fractions: { denominators: [2, 12] }, time: { minuteStep: 5 } }
				});
				for (let i = 0; i < 50; i++) {
					const problem = generateSpaceProblem(settings);
					expect(problem.op).toBe(operation);
					expect(problem.choices).toHaveLength(3);
					expect(new Set(problem.choices).size).toBe(3);
					expect(problem.choices.filter((choice) => choice === problem.answer)).toHaveLength(1);
					expect(
						parseMathAttempt({
							childId: 1,
							sessionId: '12345678-1234-4567-89ab-123456789abc',
							operation: problem.op,
							problemState: problem.state,
							givenAnswer: problem.answer
						})?.is_correct
					).toBe(true);
					expect(problemHint(problem).length).toBeGreaterThan(20);
				}
			}
		});
	}
	it('keeps a two-number recognition range instead of adding an out-of-range choice', () => {
		const problem = generateSpaceProblem(
			resolveMathSettings('K', {
				operations: ['number-recognition'],
				config: { recognition: { maxNumber: 2 } }
			})
		);
		expect(problem.choices.sort()).toEqual(['1', '2']);
	});
	it('uses grade defaults when no saved settings exist', () => {
		for (const grade of ['TK', 'K', '1', '2', '3', '5']) {
			const settings = resolveMathSettings(grade);
			for (let i = 0; i < 30; i++) {
				expect(settings.operations).toContain(generateSpaceProblem(settings).op);
			}
		}
	});
});
