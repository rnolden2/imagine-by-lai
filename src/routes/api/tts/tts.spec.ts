import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	initialize: vi.fn(),
	synthesizeSpeech: vi.fn(),
	access: vi.fn(),
	limit: vi.fn(),
	readBody: vi.fn(),
	requireOrigin: vi.fn()
}));

vi.mock('@google-cloud/text-to-speech', () => ({
	TextToSpeechClient: class {
		initialize = mocks.initialize;
		synthesizeSpeech = mocks.synthesizeSpeech;
	}
}));
vi.mock('#lib/server/games/authorization', () => ({ access: mocks.access }));
vi.mock('#lib/server/games/common', () => ({ limit: mocks.limit }));
vi.mock('#lib/server/request', () => ({
	readBody: mocks.readBody,
	requireOrigin: mocks.requireOrigin
}));

import { POST } from './+server';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.access.mockResolvedValue({ deviceId: null });
	mocks.limit.mockResolvedValue(undefined);
	mocks.readBody.mockResolvedValue({ text: 'Hello', slow: false });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('contains lazy credential initialization failure and rebuilds the client on retry', async () => {
	mocks.initialize.mockRejectedValueOnce(new Error('No application credentials'));
	const event = { locals: { requestId: 'fixture-request' } };
	const unavailable = await POST(event as never);
	expect(unavailable.status).toBe(503);
	expect(await unavailable.json()).toEqual({ error: 'Speech is temporarily unavailable.' });
	expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
	expect(console.error).toHaveBeenCalledWith('speech.failed', {
		requestId: 'fixture-request'
	});

	mocks.initialize.mockResolvedValueOnce(undefined);
	mocks.synthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('mp3') }]);
	const recovered = await POST(event as never);
	expect(recovered.status).toBe(200);
	expect(recovered.headers.get('content-type')).toBe('audio/mpeg');
	expect(recovered.headers.get('cache-control')).toBe('private, no-store');
	expect(Buffer.from(await recovered.arrayBuffer())).toEqual(Buffer.from('mp3'));
	expect(mocks.initialize).toHaveBeenCalledTimes(2);
});
