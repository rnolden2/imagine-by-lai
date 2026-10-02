import { randomBytes, randomUUID } from 'node:crypto';
import { dev } from '$app/environment';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { hash, checkResult, requireParent } from './common';

const cookie = 'word_kitchen_device';
export async function authorizeDevice(event: RequestEvent, childIds: number[]) {
	requireParent(event);
	const db = await getSupabase();
	const children = checkResult(await db.from('child_profiles').select('id').in('id', childIds));
	if (children?.length !== new Set(childIds).size) error(404, 'Child profile not found.');
	const token = randomBytes(32).toString('base64url');
	const id = randomUUID();
	checkResult(
		await db
			.from('game_devices')
			.insert({
				id,
				child_ids: childIds,
				token_hash: hash(token),
				expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
			})
	);
	event.cookies.set(cookie, token, {
		httpOnly: true,
		secure: !dev,
		sameSite: 'strict',
		path: '/',
		maxAge: 7 * 86400
	});
	return id;
}
export async function access(
	event: RequestEvent
): Promise<{ childIds: number[]; deviceId: string | null; parent: boolean }> {
	const db = await getSupabase();
	if (event.locals.user?.isAdmin) {
		const rows = checkResult(await db.from('child_profiles').select('id'));
		return { childIds: (rows ?? []).map((r) => Number(r.id)), deviceId: null, parent: true };
	}
	const token = event.cookies.get(cookie);
	if (!token || token.length > 100) error(403, 'Ask a parent to unlock games on this device.');
	const row = checkResult(
		await db
			.from('game_devices')
			.select('id,child_ids,expires_at,revoked_at')
			.eq('token_hash', hash(token))
			.maybeSingle()
	);
	if (!row || row.revoked_at || Date.parse(row.expires_at) < Date.now())
		error(403, 'Ask a parent to unlock games on this device.');
	return { childIds: row.child_ids, deviceId: row.id, parent: false };
}
export async function requireChild(event: RequestEvent, childId: number) {
	const scope = await access(event);
	if (!scope.childIds.includes(childId)) error(404, 'Not found.');
	return scope;
}
