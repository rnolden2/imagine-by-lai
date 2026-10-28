import { error } from '@sveltejs/kit';
import { env } from './runtime-config';

// Preserve existing installations when unset. Explicit invalid values fail closed.
const enabled = (value: string | undefined) => value === undefined || value === 'true';

export function gameAvailability() {
	const games = enabled(env.GAMES_ENABLED);
	const kitchen = games && enabled(env.WORD_KITCHEN_ENABLED);
	return {
		games,
		kitchen,
		generation: kitchen && enabled(env.WORD_KITCHEN_GENERATION_ENABLED)
	};
}

export function requireGameRoute(route: string) {
	const availability = gameAvailability();
	const gameRoute =
		route === '/games' || route.startsWith('/games/') || route.startsWith('/api/games/');
	const kitchenRoute =
		route === '/games/word-kitchen' ||
		route.startsWith('/games/word-kitchen/') ||
		route.startsWith('/api/games/word-kitchen/');
	if ((gameRoute && !availability.games) || (kitchenRoute && !availability.kitchen))
		error(503, 'This game is temporarily unavailable. Please try again later.');
}

export function requireKitchenGeneration() {
	if (!gameAvailability().generation)
		error(503, 'Creating new recipes is temporarily unavailable. Please try again later.');
}
