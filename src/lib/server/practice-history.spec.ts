import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from '../../../scripts/word-kitchen/test-db.mjs';

let db: PGlite;
const payload = {
	child_id: 1,
	session_id: randomUUID(),
	operation: 'addition',
	problem_state: { num1: 1, num2: 2 },
	correct_answer: '3',
	given_answer: '3',
	is_correct: true
};
function save(
	id: string,
	overrides: {
		child?: number;
		device?: string;
		hash?: string;
		occurredAt?: string;
		data?: object;
	} = {}
) {
	return db.query(`select app_record_practice($1,$2,$3,'math',$4,$5,$6) result`, [
		id,
		overrides.child ?? 1,
		overrides.device ?? null,
		overrides.hash ?? 'a'.repeat(64),
		overrides.occurredAt ?? new Date().toISOString(),
		JSON.stringify(overrides.data ?? payload)
	]);
}
beforeAll(async () => {
	db = await createTestDatabase();
}, 30000);
afterAll(async () => {
	await db?.close();
});
it('commits a history result once when many callers replay the same event', async () => {
	const id = randomUUID();
	await Promise.all(Array.from({ length: 20 }, () => save(id)));
	expect(
		(await db.query('select id from app_practice_receipts where id=$1', [id])).rows
	).toHaveLength(1);
	expect(
		(await db.query('select id from math_attempts where session_id=$1', [payload.session_id])).rows
	).toHaveLength(1);
	await expect(save(id, { hash: 'b'.repeat(64) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});
it('retains receipts after parent clearing so a replay cannot recreate erased history', async () => {
	const id = randomUUID();
	const session = randomUUID();
	await save(id, { data: { ...payload, session_id: session } });
	await db.query('delete from math_attempts where session_id=$1', [session]);
	await save(id, { data: { ...payload, session_id: session } });
	expect(
		(await db.query('select id from math_attempts where session_id=$1', [session])).rows
	).toHaveLength(0);
});
it('rolls back the receipt if the corresponding history insert fails', async () => {
	const id = randomUUID();
	await expect(save(id, { data: { ...payload, is_correct: false } })).rejects.toMatchObject({
		code: '23514'
	});
	expect(
		(await db.query('select id from app_practice_receipts where id=$1', [id])).rows
	).toHaveLength(0);
	await save(id);
	expect(
		(await db.query('select id from app_practice_receipts where id=$1', [id])).rows
	).toHaveLength(1);
});
it('rechecks device scope and revocation in the same transaction as the write', async () => {
	const device = randomUUID();
	await db.query(
		`insert into game_devices(id,child_ids,token_hash,expires_at) values($1,'{1}',$2,now()+interval '1 day')`,
		[device, randomUUID()]
	);
	await save(randomUUID(), { device });
	await expect(save(randomUUID(), { device, child: 2 })).rejects.toThrow('NOT_FOUND');
	await db.query('update game_devices set revoked_at=now() where id=$1', [device]);
	await expect(save(randomUUID(), { device })).rejects.toThrow('NOT_FOUND');
});
it('rejects expired and future-dated events and restricts direct client execution', async () => {
	for (const time of [Date.now() - 86400001, Date.now() + 3600000])
		await expect(save(randomUUID(), { occurredAt: new Date(time).toISOString() })).rejects.toThrow(
			'ATTEMPT_EXPIRED'
		);
	const result = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
		select has_function_privilege('anon','app_record_practice(uuid,bigint,uuid,text,text,timestamptz,jsonb)','execute') anon,
		has_function_privilege('authenticated','app_record_practice(uuid,bigint,uuid,text,text,timestamptz,jsonb)','execute') authenticated,
		has_function_privilege('service_role','app_record_practice(uuid,bigint,uuid,text,text,timestamptz,jsonb)','execute') service
	`);
	expect(result.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
});
