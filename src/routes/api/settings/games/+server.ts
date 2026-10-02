import { reviseRecipe } from '$lib/server/games/revisions';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { getSupabase } from '$lib/server/db';
import { settingsSchema } from '$lib/games/word-kitchen/contracts';
import {
	requireParent,
	requireOrigin,
	requireGames,
	readBody,
	childIdSchema,
	rpc,
	checkResult
} from '$lib/server/games/common';
import { authorizeDevice, requireChild } from '$lib/server/games/authorization';
import { enqueueGeneration } from '$lib/server/games/generation';
import { normalizeAnswer } from '$lib/games/word-kitchen/engine';
import type { RequestHandler } from './$types';
const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
 z.object({action:z.literal('revise'),revisionId:uuid,checksum:z.string().length(64),title:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(400),definitions:z.array(z.object({id:z.string().max(100),definition:z.string().trim().min(1).max(240)})).max(10)}),
	z.object({ action: z.literal('settings'), childId: childIdSchema, settings: settingsSchema }),
	z.object({ action: z.literal('unlock'), childIds: z.array(childIdSchema).min(1).max(50) }),
	z.object({ action: z.literal('revoke'), deviceId: uuid }),
	z.object({
		action: z.literal('favorite'),
		childId: childIdSchema,
		name: z.string().trim().min(1).max(120)
	}),
	z.object({ action: z.literal('remove_favorite'), id: uuid }),
	z.object({ action: z.literal('generate'), childId: childIdSchema, favoriteId: uuid, key: uuid }),
	z.object({ action: z.literal('cancel'), jobId: uuid }),
	z.object({
		action: z.literal('approve'),
		revisionId: uuid,
		checksum: z.string().length(64),
		childId: childIdSchema,
		preferenceRevision: z.number().int().nonnegative()
	}),
	z.object({ action: z.literal('archive'), recipeId: uuid }),
	z.object({
		action: z.literal('clear_history'),
		childId: childIdSchema,
		confirmation: z.literal('CLEAR')
	})
]);
export const POST: RequestHandler = async (e) => {
	requireGames();
	requireParent(e);
	requireOrigin(e);
	const b = await readBody(e, schema);
	const db = await getSupabase();
	if ('childId' in b) await requireChild(e, b.childId);
	switch (b.action) {
 case 'revise':return json(await reviseRecipe(b.revisionId,b.checksum,b.title,b.description,b.definitions));
		case 'settings':
			return json(
				await rpc('wk_save_settings', {
					p_child: b.childId,
					p_settings: b.settings,
					p_expected: b.settings.revision
				})
			);
		case 'unlock':
			return json({ id: await authorizeDevice(e, b.childIds) });
		case 'revoke':
			checkResult(
				await db
					.from('game_devices')
					.update({ revoked_at: new Date().toISOString() })
					.eq('id', b.deviceId)
			);
			break;
		case 'favorite':
			checkResult(
				await db
					.from('game_favorite_foods')
					.upsert(
						{ child_id: b.childId, display_name: b.name, normalized_name: normalizeAnswer(b.name) },
						{ onConflict: 'child_id,normalized_name' }
					)
			);
			break;
		case 'remove_favorite':
			checkResult(await db.from('game_favorite_foods').delete().eq('id', b.id));
			break;
		case 'generate':
			return json(await enqueueGeneration(b.childId, b.favoriteId, b.key), { status: 202 });
		case 'cancel':
			await rpc('wk_cancel_job', { p_id: b.jobId });
			break;
		case 'approve':
			await rpc('wk_approve_recipe', {
				p_revision: b.revisionId,
				p_checksum: b.checksum,
				p_child: b.childId,
				p_preferences: b.preferenceRevision
			});
			break;
		case 'archive':
			checkResult(
				await db
					.from('game_recipes')
					.update({ archived_at: new Date().toISOString() })
					.eq('id', b.recipeId)
					.eq('origin', 'generated')
			);
			break;
		case 'clear_history':
			await rpc('wk_clear_history', { p_child: b.childId });
			break;
		default:
			error(400, 'Unsupported action.');
	}
	return json({ ok: true });
};
