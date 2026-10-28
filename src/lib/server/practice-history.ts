import { z } from 'zod';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from './db';
import { requireChild } from './games/authorization';
import { hash, limit } from './games/common';

export const receiptSchema = z.object({
	eventId: z.string().uuid(),
	occurredAt: z.iso.datetime()
});
export async function recordPractice(
	event: RequestEvent,
	kind: 'math' | 'spelling',
	receipt: z.infer<typeof receiptSchema>,
	payload: { child_id: number } & Record<string, unknown>
) {
	const time = Date.parse(receipt.occurredAt);
	if (time < Date.now() - 86400000 || time > Date.now() + 300000)
		error(409, 'This practice result has expired. Start a new practice session.');
	const scope = await requireChild(event, payload.child_id);
	await limit(`app:practice:${scope.deviceId ?? 'parent'}`, 120, 60);
	const db = await getSupabase();
	const result = await db.rpc('app_record_practice', {
		p_id: receipt.eventId,
		p_child: payload.child_id,
		p_device: scope.deviceId,
		p_kind: kind,
		p_hash: hash({ kind, occurredAt: receipt.occurredAt, payload }),
		p_occurred_at: receipt.occurredAt,
		p_payload: payload
	});
	if (result.error) {
		if (result.error.message?.includes('NOT_FOUND'))
			error(404, 'Practice access is no longer available.');
		if (result.error.message?.includes('IDEMPOTENCY_CONFLICT'))
			error(409, 'This practice result conflicts with an earlier submission.');
		if (result.error.message?.includes('ATTEMPT_EXPIRED'))
			error(409, 'This practice result has expired.');
		console.error('practice.save.failed', { requestId: event.locals.requestId, kind });
		error(503, 'Practice history could not be saved. Please retry.');
	}
}
