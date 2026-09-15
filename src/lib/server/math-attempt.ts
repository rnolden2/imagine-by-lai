import { isOperation } from '$lib/math';

function integer(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Validate public practice input and compute correctness on the server. */
export function parseMathAttempt(value: unknown) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	const childId = input.childId ?? input.userId;
	const op = input.operation;
	if (
		!integer(childId, 1, Number.MAX_SAFE_INTEGER) ||
		!isOperation(op) ||
		typeof input.sessionId !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sessionId)
	)
		return null;
	if (
		typeof input.givenAnswer !== 'string' ||
		!input.givenAnswer.trim() ||
		input.givenAnswer.length > 32
	)
		return null;
	const rawState = input.problemState ?? { num1: input.num1, num2: input.num2 };
	if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return null;
	const state = rawState as Record<string, unknown>;
	let answer: string;
	let problemState: Record<string, number>;
	if (op === 'fractions') {
		const { numerator, denominator } = state;
		if (!integer(denominator, 2, 12) || !integer(numerator, 1, denominator - 1)) return null;
		answer = `${numerator}/${denominator}`;
		problemState = { numerator, denominator };
	} else if (op === 'time') {
		const { hour, minute } = state;
		if (!integer(hour, 1, 12) || !integer(minute, 0, 59) || minute % 5 !== 0) return null;
		answer = `${hour}:${String(minute).padStart(2, '0')}`;
		problemState = { hour, minute };
	} else if (op === 'number-recognition') {
		if (!integer(state.number, 1, 20)) return null;
		answer = String(state.number);
		problemState = { number: state.number };
	} else {
		const { num1, num2 } = state;
		if (!integer(num1, 1, 1000) || !integer(num2, 1, 1000)) return null;
		if (op === 'subtraction' && num1 <= num2) return null;
		if (op === 'multiplication' && (num1 > 12 || num2 > 12)) return null;
		if (op === 'division' && (num2 > 12 || num1 % num2 !== 0 || num1 / num2 > 12)) return null;
		answer = String(
			op === 'addition'
				? num1 + num2
				: op === 'subtraction'
					? num1 - num2
					: op === 'multiplication'
						? num1 * num2
						: num1 / num2
		);
		problemState = { num1, num2 };
	}
	const given = input.givenAnswer.trim();
	return {
		child_id: childId,
		session_id: input.sessionId,
		operation: op,
		problem_state: problemState,
		correct_answer: answer,
		given_answer: given,
		is_correct: given === answer
	};
}
