import { beforeEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const db = vi.hoisted(() => ({
	get: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	eq: vi.fn(),
	maybeSingle: vi.fn(),
	upsert: vi.fn(),
	delete: vi.fn()
}));
vi.mock('$lib/server/db', () => ({
	getSupabase: db.get,
	throwSupabaseError: (_: string, error: unknown) => {
		throw error;
	}
}));
import { saveMathSettings, clearMathStats } from './math-settings';
function event(values: Record<string, string | string[]> = {}, admin = true) {
	const form = new FormData();
	for (const [key, value] of Object.entries(values))
		for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
	return {
		request: new Request('http://localhost/settings', { method: 'POST', body: form }),
		locals: { user: { isAdmin: admin } }
	} as RequestEvent;
}
const valid = { userId: '1', operations: ['time'], maxNumber: '20', minuteStep: '5' };
beforeEach(() => {
	vi.clearAllMocks();
	db.get.mockResolvedValue(db);
	db.from.mockReturnValue(db);
	db.select.mockReturnValue(db);
	db.eq.mockReturnValue(db);
	db.delete.mockReturnValue(db);
	db.maybeSingle.mockResolvedValue({ data: { id: 1 }, error: null });
	db.upsert.mockResolvedValue({ error: null });
});
it('only admins can change settings or clear history', async () => {
	expect(await saveMathSettings(event(valid, false))).toMatchObject({ status: 403 });
	expect(await clearMathStats(event(valid, false))).toMatchObject({ status: 403 });
	expect(db.get).not.toHaveBeenCalled();
});
it('rejects empty operations, invalid modes, unsupported ranges and invalid child IDs without writing', async () => {
	for (const change of [
		{ operations: [] },
		{ operations: ['addition', 'invalid'] },
		{ maxNumber: '-1' },
		{ maxNumber: '2.5' },
		{ minuteStep: '7' },
		{ userId: '0' },
		{ userId: '1.5' }
	])
		expect(await saveMathSettings(event({ ...valid, ...change }))).toMatchObject({ status: 400 });
	expect(db.upsert).not.toHaveBeenCalled();
});
it('saves a unique set of modes for exactly the selected child', async () => {
	expect(
		await saveMathSettings(event({ ...valid, operations: ['time', 'time', 'division'] }))
	).toMatchObject({ success: true });
	expect(db.upsert).toHaveBeenCalledWith(
		expect.objectContaining({
			child_id: 1,
			operations: ['time', 'division'],
			config: expect.objectContaining({ maxNumber: 20, time: { minuteStep: 5 } })
		}),
		{ onConflict: 'child_id' }
	);
});
it('reports deleted children and database failures without claiming success', async () => {
	db.maybeSingle.mockResolvedValueOnce({ data: null });
	expect(await saveMathSettings(event(valid))).toMatchObject({ status: 404 });
	db.upsert.mockResolvedValueOnce({ error: { code: 'db-failure' } });
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	expect(await saveMathSettings(event(valid))).toMatchObject({ status: 503 });
	log.mockRestore();
});
it('never clears all children when the child ID is missing', async () => {
	expect(await clearMathStats(event())).toMatchObject({ status: 400 });
	expect(db.delete).not.toHaveBeenCalled();
	expect(await clearMathStats(event({ userId: '2' }))).toMatchObject({ success: true });
	expect(db.eq).toHaveBeenCalledWith('child_id', 2);
});
