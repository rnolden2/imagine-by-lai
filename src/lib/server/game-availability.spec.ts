import { beforeEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('./runtime-config', () => ({ env: config }));
import { gameAvailability, requireGameRoute, requireKitchenGeneration } from './game-availability';

beforeEach(() => {
	for (const key of Object.keys(config)) delete config[key];
});

it('preserves enabled behavior for existing installations with unset switches', () => {
	expect(gameAvailability()).toEqual({ games: true, kitchen: true, generation: true });
});

it.each(['false', '', 'TRUE', 'invalid'])(
	'fails closed for an explicit unsupported value %j',
	(value) => {
		config.GAMES_ENABLED = value;
		expect(gameAvailability()).toEqual({ games: false, kitchen: false, generation: false });
		for (const route of [
			'/games',
			'/games/space-math',
			'/games/word-kitchen',
			'/api/games/word-kitchen/start'
		])
			expect(() => requireGameRoute(route)).toThrow();
		expect(() => requireKitchenGeneration()).toThrow();
	}
);

it('disables only Kitchen while preserving Space Math and administrative recovery', () => {
	config.WORD_KITCHEN_ENABLED = 'false';
	expect(gameAvailability()).toEqual({ games: true, kitchen: false, generation: false });
	expect(() => requireGameRoute('/games/word-kitchen/session/[sessionId]')).toThrow();
	expect(() => requireGameRoute('/api/games/word-kitchen/session/[sessionId]/audio')).toThrow();
	for (const route of [
		'/games',
		'/games/space-math',
		'/settings/games',
		'/api/settings/games',
		'/api/internal/word-kitchen/reconcile',
		'/math',
		'/login'
	])
		expect(() => requireGameRoute(route)).not.toThrow();
});

it('disables new generation without preventing starter play', () => {
	config.WORD_KITCHEN_GENERATION_ENABLED = 'false';
	expect(gameAvailability()).toEqual({ games: true, kitchen: true, generation: false });
	expect(() => requireGameRoute('/games/word-kitchen')).not.toThrow();
	expect(() => requireKitchenGeneration()).toThrow();
	config.WORD_KITCHEN_GENERATION_ENABLED = 'true';
	expect(() => requireKitchenGeneration()).not.toThrow();
});
