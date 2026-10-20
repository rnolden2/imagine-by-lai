export const gameRegistry = [
	{
		id: 'space-math',
		label: 'Space Math',
		route: '/games/space-math',
		engineVersion: 'space-math.engine.v1',
		domains: ['math'],
		description: 'A little math fuels a whole new adventure. Explore the planets at your own pace.'
	},
	{
		id: 'word-kitchen',
		label: 'Word Kitchen',
		route: '/games/word-kitchen',
		engineVersion: 'word-kitchen.engine.v1',
		domains: ['spelling', 'vocabulary'],
		description: 'A little spelling. A little stirring. Something wonderful to share.'
	}
] as const;
