import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from '../../../scripts/word-kitchen/test-db.mjs';

let db: PGlite;
type Session = { child_id: number; session_id: string; total: number; correct: number };
type Summary = {
	mathStats: Session[];
	spellingStats: Session[];
	mathAttemptCount: number;
	spellingAttemptCount: number;
};
async function summary() {
	return (await db.query<{ result: Summary }>('select app_practice_summaries() result')).rows[0]
		.result;
}
beforeAll(async () => {
	db = await createTestDatabase();
}, 30000);
afterAll(async () => {
	await db?.close();
});
it('counts complete sessions larger than the Data API row limit', async () => {
	await db.exec(`insert into math_attempts(child_id,session_id,operation,problem_state,correct_answer,given_answer,is_correct)
		select 1,'long-session','addition','{"num1":1,"num2":2}','3','3',true from generate_series(1,1205)`);
	const result = await summary();
	expect(result.mathStats).toEqual([
		expect.objectContaining({ session_id: 'long-session', total: 1205, correct: 1205 })
	]);
	expect(result.mathAttemptCount).toBe(1205);
	expect(result.spellingAttemptCount).toBe(0);
	expect(result.spellingStats).toEqual([]);
});
it('keeps children separate even when spelling sessions and grades match', async () => {
	await db.exec(`insert into spelling_attempts(child_id,session_id,word,grade,attempts_used,is_correct)
		values(1,'shared-session','cat','1',1,true),(2,'shared-session','dog','1',3,false)`);
	const result = await summary();
	expect(result.spellingStats).toHaveLength(2);
	expect(result.spellingStats.find((row) => row.child_id === 1)).toMatchObject({
		total: 1,
		correct: 1
	});
	expect(result.spellingStats.find((row) => row.child_id === 2)).toMatchObject({
		total: 1,
		correct: 0
	});
	expect(result.spellingAttemptCount).toBe(2);
});
it('bounds recent sessions without truncating all-time totals and denies direct client access', async () => {
	await db.exec(`insert into math_attempts(child_id,session_id,operation,problem_state,correct_answer,given_answer,is_correct)
		select 1,'session-'||n,'addition','{"num1":1,"num2":2}','3','3',true from generate_series(1,105) n`);
	const result = await summary();
	expect(result.mathStats).toHaveLength(100);
	expect(result.mathAttemptCount).toBe(1310);
	await db.exec('set role authenticated');
	await expect(summary()).rejects.toMatchObject({ code: '42501' });
	await db.exec('reset role');
});
