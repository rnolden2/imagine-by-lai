import { createHash } from 'node:crypto';
import {
	validateRecipe,
	type Recipe,
	type RecipeStep,
	type Vocabulary
} from '$lib/games/word-kitchen/contracts';

export function stableId(value: string) {
	const h = createHash('sha256').update(`word-kitchen-v1:${value}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const concepts = [
	['ingredient:strawberry', 'strawberry', 'fruit'],
	['ingredient:banana', 'banana', 'fruit'],
	['ingredient:blueberry', 'blueberry', 'fruit'],
	['ingredient:flour', 'flour', 'wheat'],
	['ingredient:milk', 'milk', 'dairy'],
	['ingredient:egg', 'egg', 'egg'],
	['ingredient:tomato', 'tomato', 'vegetable'],
	['ingredient:cheese', 'cheese', 'dairy'],
	['ingredient:dough', 'dough', 'wheat'],
	['ingredient:honey', 'honey', 'sweetener'],
	['ingredient:basil', 'basil', 'herb'],
	['tool:bowl', 'bowl', ''],
	['tool:whisk', 'whisk', ''],
	['tool:cup', 'cup', ''],
	['tool:spoon', 'spoon', ''],
	['tool:pan', 'pan', ''],
	['tool:plate', 'plate', ''],
	['tool:spatula', 'spatula', ''],
	['dish:fruit-salad', 'Fruit Salad', ''],
	['dish:pancakes', 'Pancakes', ''],
	['dish:pizza', 'Pizza', ''],
	['environment:kitchen', 'Kitchen', '']
].map(([id, label, tag]) => ({ id, label, kind: id.split(':')[0], tags: tag ? [tag] : [] }));
export const conceptMap = new Map(concepts.map((c) => [c.id, c]));
const all = [5, 8, 10] as const;
const vocab = (id: string, word: string, definition: string, conceptId?: string): Vocabulary => ({
	id,
	word,
	definition,
	contextSentence: `In our pretend kitchen, we use ${word}.`,
	conceptId,
	difficultyBand: 'developing',
	locale: 'en-US'
});
const shared = [
	vocab('bowl', 'bowl', 'A round container that holds food.', 'tool:bowl'),
	vocab('mix', 'mix', 'To move ingredients together.'),
	vocab('pour', 'pour', 'To tip a container so something flows out.'),
	vocab('measure', 'measure', 'To find how much you need.'),
	vocab('serve', 'serve', 'To give someone food that is ready.'),
	vocab('plate', 'plate', 'A flat dish that holds your food.', 'tool:plate')
];
export type RecipeInput = {
	slug: string;
	title: string;
	description: string;
	ingredients: string[];
	vocabulary: Vocabulary[];
	actions: Array<{
		mechanic: 'slice' | 'whisk' | 'pour' | 'stir' | 'measure' | 'drag_to_bowl' | 'timer';
		label: string;
		object: string;
		state: string;
	}>;
};
export const curatedInputs: RecipeInput[] = [
	{
		slug: 'fruit-salad',
		title: 'Fruit Salad',
		description:
			'A rainbow in a bowl. Gather juicy fruit, practice your words, and make something bright.',
		ingredients: ['strawberry', 'banana', 'blueberry'],
		vocabulary: [
			vocab(
				'strawberry',
				'strawberry',
				'A small red fruit with seeds on the outside.',
				'ingredient:strawberry'
			),
			vocab('slice', 'slice', 'To make smaller pieces.', 'ingredient:banana'),
			...shared
		],
		actions: [
			{ mechanic: 'slice', label: 'Pretend slice', object: 'ingredient:banana', state: 'sliced' },
			{ mechanic: 'drag_to_bowl', label: 'Add the fruit', object: 'tool:bowl', state: 'fruit' },
			{ mechanic: 'stir', label: 'Gently mix', object: 'tool:bowl', state: 'mixed' }
		]
	},
	{
		slug: 'pancakes',
		title: 'Pancakes',
		description: 'Fluffy little circles of joy. Measure, whisk, and flip in our pretend kitchen.',
		ingredients: ['flour', 'milk', 'egg'],
		vocabulary: [
			vocab('flour', 'flour', 'A soft powder used to make bread and pancakes.', 'ingredient:flour'),
			vocab('whisk', 'whisk', 'A tool that mixes ingredients with wire loops.', 'tool:whisk'),
			...shared
		],
		actions: [
			{ mechanic: 'measure', label: 'Fill to the line', object: 'tool:cup', state: 'filled' },
			{ mechanic: 'whisk', label: 'Whisk the batter', object: 'tool:bowl', state: 'batter' },
			{ mechanic: 'pour', label: 'Pour the batter', object: 'tool:pan', state: 'cooking' },
			{
				mechanic: 'timer',
				label: 'Our pretend pancakes are ready',
				object: 'tool:pan',
				state: 'ready'
			},
			{ mechanic: 'drag_to_bowl', label: 'Flip and plate', object: 'tool:plate', state: 'pancakes' }
		]
	},
	{
		slug: 'pizza',
		title: 'Pizza',
		description:
			'Make a little pizza with a big imagination. Spread, sprinkle, and practice along the way.',
		ingredients: ['dough', 'tomato', 'cheese'],
		vocabulary: [
			vocab('dough', 'dough', 'A soft mixture used to make bread or pizza.', 'ingredient:dough'),
			vocab(
				'sprinkle',
				'sprinkle',
				'To scatter little pieces over something.',
				'ingredient:cheese'
			),
			...shared
		],
		actions: [
			{ mechanic: 'measure', label: 'Measure the sauce', object: 'tool:cup', state: 'filled' },
			{ mechanic: 'pour', label: 'Spread the sauce', object: 'tool:plate', state: 'sauce' },
			{
				mechanic: 'drag_to_bowl',
				label: 'Sprinkle the cheese',
				object: 'tool:plate',
				state: 'pizza'
			},
			{ mechanic: 'timer', label: 'Pretend bake and serve', object: 'tool:plate', state: 'ready' }
		]
	}
];

export function buildRecipe(input: RecipeInput): Recipe {
	const recipeId = stableId(`recipe:${input.slug}`);
	const revisionId = stableId(`recipe:${input.slug}:1`);
	const ingredientConceptIds = input.ingredients.map((i) => `ingredient:${i}`);
	const used = [
		...new Set([
			...ingredientConceptIds,
			'tool:bowl',
			'tool:whisk',
			'tool:cup',
			'tool:spoon',
			'tool:pan',
			'tool:plate',
			'tool:spatula',
			`dish:${input.slug}`,
			'environment:kitchen'
		])
	];
	const assetRequirements = used.map((conceptId) => ({
		role: conceptId.replace(':', '-'),
		conceptId,
		state: 'whole',
		styleVersion: 'word-kitchen-v1' as const,
		view: 'three-quarter' as const,
		contractVersion: 'kitchen-asset.v1' as const,
		assetRevisionId: stableId(`asset:${conceptId}:whole`)
	}));
	const steps: RecipeStep[] = [];
	// Each duration has a fully independent linear path, simplifying validation and replay.
	for (const duration of all) {
		let previous: string[] = [];
		let index = 0;
		const add = (step: Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>) => {
			const next = {
				...step,
				id: `d${duration}-${index++}`,
				after: previous,
				durationPresets: [duration]
			} as RecipeStep;
			steps.push(next);
			previous = [next.id];
		};
		const cookingCount = duration === 5 ? 4 : duration === 8 ? 6 : 7;
		const learningCount = duration === 5 ? 2 : duration === 8 ? 4 : 5;
		for (let i = 0; i < cookingCount; i++) {
			const word = input.vocabulary[i % input.vocabulary.length];
			if (i === 0) {
				const choices = input.ingredients.map((v, k) => ({
					id: `choice-${k}`,
					label: conceptMap.get(`ingredient:${v}`)?.label ?? v,
					conceptId: `ingredient:${v}`
				}));
				add({
					kind: 'challenge',
					mechanic: 'ingredient_select',
					instruction: `Find the ${choices[0].label}.`,
					config: { choices, answer: 'choice-0' },
					assetRoles: ingredientConceptIds.map((c) => c.replace(':', '-')),
					wordBinding: { source: 'cooking', vocabularyId: word.id }
				} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
			} else if (i === 2) {
				add({
					kind: 'challenge',
					mechanic: 'definition_match',
					instruction: `What does “${word.word}” mean?`,
					config: {
						choices: [
							{ id: 'meaning', label: word.definition },
							{ id: 'other', label: 'A sound that a musical instrument makes.' }
						],
						answer: 'meaning'
					},
					assetRoles: [],
					wordBinding: { source: 'cooking', vocabularyId: word.id }
				} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
			} else
				add({
					kind: 'challenge',
					mechanic: i % 3 === 0 ? 'word_unscramble' : i % 3 === 1 ? 'word_spell' : 'letter_fill',
					instruction: 'Listen to a kitchen word. Give it a try!',
					config: { skill: 'spelling' },
					assetRoles: [],
					wordBinding: { source: 'cooking', vocabularyId: word.id }
				} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
			const action = input.actions[i];
			if (action)
				add({
					kind: 'action',
					mechanic: action.mechanic,
					instruction: `In our pretend kitchen, ${action.label.toLowerCase()}.`,
					config: {
						actionLabel: action.label,
						objectConceptId: action.object,
						requires: {},
						effects: { [action.object]: action.state },
						...(action.mechanic === 'timer' ? { seconds: 3 } : {}),
						...(action.mechanic === 'measure' ? { quantityLabel: 'One cup' } : {})
					},
					assetRoles: [action.object.replace(':', '-')]
				} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
			if (i < learningCount)
				add({
					kind: 'challenge',
					mechanic: 'word_spell',
					instruction: 'A word from your practice list. Listen, then spell.',
					config: { skill: 'spelling' },
					wordBinding: { source: 'learning', slotId: `learning-${i}` },
					assetRoles: []
				} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
		}
		add({
			kind: 'challenge',
			mechanic: 'word_spell',
			instruction: 'Chef’s Challenge! Practice one word again.',
			config: { skill: 'spelling' },
			wordBinding: { source: 'review', slotId: 'learning-0' },
			assetRoles: []
		} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
		add({
			kind: 'decoration',
			mechanic: 'decorate',
			instruction: 'Make it yours. Add a few tasty finishing touches!',
			config: {
				actionLabel: 'Finish decorating',
				objectConceptId: 'tool:plate',
				maxPlacements: 12,
				requires: {},
				effects: {}
			},
			assetRoles: ingredientConceptIds.map((c) => c.replace(':', '-'))
		} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
		add({
			kind: 'finish',
			mechanic: 'finish',
			instruction: 'Your dish is ready to share!',
			config: {},
			assetRoles: [`dish-${input.slug}`]
		} as Omit<RecipeStep, 'id' | 'after' | 'durationPresets'>);
	}
	return validateRecipe({
		schemaVersion: 'word-kitchen.recipe.v1',
		engineVersion: 'word-kitchen.engine.v1',
		recipeId,
		revisionId,
		title: input.title,
		description: input.description,
		locale: 'en-US',
		styleVersion: 'word-kitchen-v1',
		supportedDurations: [5, 8, 10],
		gradeBand: { min: 'TK', max: '8' },
		ingredientConceptIds,
		exclusionTags: [...new Set(ingredientConceptIds.flatMap((c) => conceptMap.get(c)?.tags ?? []))],
		vocabulary: input.vocabulary,
		assetRequirements,
		steps,
		heroAssetId: stableId(`asset:dish:${input.slug}:whole`)
	});
}
export const curatedRecipes = curatedInputs.map(buildRecipe);
