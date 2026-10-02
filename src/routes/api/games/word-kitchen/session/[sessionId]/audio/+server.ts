import { json, error } from '@sveltejs/kit';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { requireOrigin, readBody, hash, limit } from '$lib/server/games/common';
import { sessionRow } from '$lib/server/games/sessions';
import type { RequestHandler } from './$types';
const tts = new TextToSpeechClient();
const storage = new Storage();
export const POST: RequestHandler = async (e) => {
	requireOrigin(e);
	const row = await sessionRow(e, e.params.sessionId);
	const b = await readBody(
		e,
		z.object({ stepId: z.string(), slow: z.boolean().default(false) }).strict()
	);
	const step = row.snapshot.steps[row.state.index];
	if (!step || step.id !== b.stepId || Date.parse(row.expires_at) < Date.now())
		error(409, 'Step changed.');
	await limit(`audio:${row.id}`, 90, 60);
	const phrase = step.word ?? step.instruction;
	const voice = 'en-US-Neural2-H';
	const key = hash({ phrase, voice, slow: b.slow, version: 1 });
	const file = storage.bucket(GCS_BUCKET_NAME).file(`imagine-by-lai/word-kitchen/audio/${key}.mp3`);
	try {
		let audio: Buffer;
		try {
			[audio] = await file.download();
		} catch {
			const [result] = await tts.synthesizeSpeech(
				{
					input: { text: phrase },
					voice: { languageCode: 'en-US', name: voice },
					audioConfig: { audioEncoding: 'MP3', speakingRate: b.slow ? 0.65 : 0.9 }
				},
				{ timeout: 12000 }
			);
			if (!result.audioContent) throw new Error('EMPTY_AUDIO');
			audio = Buffer.from(result.audioContent as Uint8Array);
			try {
				await file.save(audio, {
					contentType: 'audio/mpeg',
					resumable: false,
					preconditionOpts: { ifGenerationMatch: 0 }
				});
			} catch {
				/* An audio cache write must not prevent playback. */
			}
		}
		return new Response(new Uint8Array(audio), {
			headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private,max-age=3600' }
		});
	} catch {
		return json({ browserFallback: phrase }, { headers: { 'Cache-Control': 'private,no-store' } });
	}
};
