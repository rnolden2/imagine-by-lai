import { z } from 'zod';

export const ENGINE_VERSION = 'word-kitchen.engine.v1';
export const SCHEMA_VERSION = 'word-kitchen.recipe.v1';
export const POLICY_VERSION = 'chef-points.v1';
export const durations = [5, 8, 10] as const;
const label = z.string().trim().min(1).max(240);
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
export const durationSchema = z.union([z.literal(5), z.literal(8), z.literal(10)]);
export const settingsSchema = z
	.object({
		difficulty: z.enum(['supported', 'standard', 'challenge']).default('standard'),
		targetMinutes: durationSchema.default(8),
		locale: z.literal('en-US').default('en-US'),
		excludedFoodConceptIds: z.array(id).max(60).default([]),
		revision: z.number().int().nonnegative().default(0)
	})
	.strict();
export type GameSettings = z.infer<typeof settingsSchema>;

const choice = z.object({ id, label, conceptId: id.optional() }).strict();
const choiceConfig = z.object({ choices: z.array(choice).min(2).max(4), answer: id }).strict();
const wordConfig = z.object({ skill: z.literal('spelling') }).strict();
const actionConfig = z
	.object({
		actionLabel: label,
		objectConceptId: id,
		destinationConceptId: id.optional(),
		requires: z.record(id, id).default({}),
		effects: z.record(id, id).default({}),
		quantityLabel: label.optional(),
		maxPlacements: z.number().int().min(1).max(12).optional(),
		seconds: z.number().min(0).max(4).optional()
	})
	.strict();
const stepBase = {
	id,
	instruction: label,
	after: z.array(id).max(4),
	durationPresets: z.array(durationSchema).min(1),
	assetRoles: z.array(id).max(12),
	wordBinding: z
		.discriminatedUnion('source', [
			z.object({ source: z.literal('cooking'), vocabularyId: id }).strict(),
			z.object({ source: z.literal('learning'), slotId: id }).strict(),
			z.object({ source: z.literal('review'), slotId: id }).strict()
		])
		.optional()
};
const actionMechanics = [
	'measure',
	'drag_to_bowl',
	'pour',
	'stir',
	'whisk',
	'slice',
	'timer'
] as const;
export const stepSchema = z.discriminatedUnion('mechanic', [
	z
		.object({
			...stepBase,
			kind: z.literal('challenge'),
			mechanic: z.enum(['word_spell', 'letter_fill', 'word_unscramble']),
			config: wordConfig
		})
		.strict(),
	z
		.object({
			...stepBase,
			kind: z.literal('challenge'),
			mechanic: z.enum([
				'ingredient_select',
				'picture_match',
				'definition_match',
				'multiple_choice'
			]),
			config: choiceConfig
		})
		.strict(),
	z
		.object({
			...stepBase,
			kind: z.literal('action'),
			mechanic: z.enum(actionMechanics),
			config: actionConfig
		})
		.strict(),
	z
		.object({
			...stepBase,
			kind: z.literal('decoration'),
			mechanic: z.literal('decorate'),
			config: actionConfig
		})
		.strict(),
	z
		.object({
			...stepBase,
			kind: z.literal('finish'),
			mechanic: z.literal('finish'),
			config: z.object({}).strict()
		})
		.strict()
]);
export type RecipeStep = z.infer<typeof stepSchema>;
export const vocabularySchema = z
	.object({
		id,
		conceptId: id.optional(),
		word: label,
		definition: label,
		contextSentence: label,
		difficultyBand: z.enum(['emerging', 'developing', 'confident']),
		locale: z.literal('en-US')
	})
	.strict();
export const assetRequirementSchema = z
	.object({
		role: id,
		conceptId: id,
		state: id,
		styleVersion: z.literal('word-kitchen-v1'),
		view: z.enum(['three-quarter', 'top', 'front']),
		contractVersion: z.literal('kitchen-asset.v1'),
		assetRevisionId: z.string().uuid()
	})
	.strict();
export const recipeSchema = z
	.object({
		schemaVersion: z.literal(SCHEMA_VERSION),
		engineVersion: z.literal(ENGINE_VERSION),
		recipeId: z.string().uuid(),
		revisionId: z.string().uuid(),
		title: label,
		description: z.string().min(1).max(600),
		locale: z.literal('en-US'),
		styleVersion: z.literal('word-kitchen-v1'),
		supportedDurations: z.array(durationSchema).min(1),
		gradeBand: z.object({ min: label, max: label }).strict(),
		ingredientConceptIds: z.array(id).min(1).max(20),
		exclusionTags: z.array(id).max(50),
		vocabulary: z.array(vocabularySchema).min(4).max(10),
		assetRequirements: z.array(assetRequirementSchema).min(1).max(40),
		steps: z.array(stepSchema).min(5).max(60),
		heroAssetId: z.string().uuid()
	})
	.strict();
export type Recipe = z.infer<typeof recipeSchema>;
export type Vocabulary = z.infer<typeof vocabularySchema>;
export const grades = ['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8'];

export function validateRecipe(input: unknown): Recipe {
	const recipe = recipeSchema.parse(input);
	const ids = new Set(recipe.steps.map((s) => s.id));
	if (ids.size !== recipe.steps.length) throw new Error('Duplicate step IDs');
	const vocabulary = new Set(recipe.vocabulary.map((v) => v.id));
	if (vocabulary.size !== recipe.vocabulary.length) throw new Error('Duplicate vocabulary IDs');
	const assets = new Set(recipe.assetRequirements.map((a) => a.role));
	if (!recipe.assetRequirements.some((a) => a.assetRevisionId === recipe.heroAssetId))
		throw new Error('Missing hero asset');
	if (
		grades.indexOf(recipe.gradeBand.min) < 0 ||
		grades.indexOf(recipe.gradeBand.max) < grades.indexOf(recipe.gradeBand.min)
	)
		throw new Error('Invalid grade band');
	for (const duration of recipe.supportedDurations) {
		const steps = recipe.steps.filter((s) => s.durationPresets.includes(duration));
		const seen = new Set<string>();
		const scene: Record<string, string> = {};
		const slots = new Set<string>();
		if (steps.filter((s) => s.kind === 'finish').length !== 1 || steps.at(-1)?.kind !== 'finish')
			throw new Error('Every duration needs one final finish step');
		const count = steps.filter((s) => s.kind === 'challenge').length;
		if (count < 4 || count > 14) throw new Error('Invalid challenge count');
		for (const step of steps) {
			if (step.after.some((previous) => !seen.has(previous)))
				throw new Error('Cycle, missing dependency, or invalid duration path');
			if (step.assetRoles.some((role) => !assets.has(role)))
				throw new Error('Unresolved asset role');
			const binding = step.wordBinding;
			if (binding?.source === 'cooking' && !vocabulary.has(binding.vocabularyId))
				throw new Error('Missing vocabulary');
			if (binding?.source === 'learning') {
				if (slots.has(binding.slotId)) throw new Error('Duplicate learning slot');
				slots.add(binding.slotId);
			}
			if (binding?.source === 'review' && !slots.has(binding.slotId))
				throw new Error('Review must follow a bound learning slot');
			if ('choices' in step.config) {
				const config = step.config;
				if (
					new Set(config.choices.map((c) => c.id)).size !== config.choices.length ||
					config.choices.filter((c) => c.id === config.answer).length !== 1
				)
					throw new Error('Invalid answer choices');
			}
			if (['word_spell', 'letter_fill', 'word_unscramble'].includes(step.mechanic) && !binding)
				throw new Error('Spelling step requires a word binding');
			if ('requires' in step.config) {
				for (const [object, state] of Object.entries(step.config.requires))
					if ((scene[object] ?? 'empty') !== state) throw new Error('Illegal cooking state');
				Object.assign(scene, step.config.effects);
			}
			seen.add(step.id);
		}
	}
	return recipe;
}

export const eventSchema = z
	.object({
		eventId: z.string().uuid(),
		expectedSequence: z.number().int().nonnegative(),
		stepId: id,
		type: z.enum([
			'submit_answer',
			'request_hint',
			'reveal_answer',
			'complete_action',
			'set_decoration',
			'pause',
			'resume',
			'abandon'
		]),
		payload: z
			.object({
				answer: z.string().max(240).optional(),
				action: z.string().max(100).optional(),
				placements: z
					.array(
						z
							.object({ conceptId: id, x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
							.strict()
					)
					.max(12)
					.optional()
			})
			.strict()
	})
	.strict();
export type GameEvent = z.infer<typeof eventSchema>;
export type BoundStep = RecipeStep & {
	word?: string;
	wordId?: string;
	wordSource?: 'custom' | 'grade_list' | 'cooking';
	review?: boolean;
	acceptedForms?: string[];
};
export type Assistance = 'independent' | 'hinted' | 'guided';
export type Evidence = {
	stepId: string;
	word: string;
	wordId?: string;
	wordSource: string;
	skill: 'spelling' | 'vocabulary';
	mechanic: string;
	correct: boolean;
	assistance: Assistance;
	submission: number;
	review: boolean;
	firstTry: boolean;
};
export type SessionState = {
	index: number;
	sequence: number;
	status: 'active' | 'paused' | 'completed' | 'abandoned';
	scene: Record<string, string>;
	assistance: Record<string, Assistance>;
	submissions: Record<string, number>;
	evidence: Evidence[];
	completed: string[];
	decorations: Array<{ conceptId: string; x: number; y: number }>;
	activeMs: number;
	lastActiveAt: number;
	points: number;
	feedback: string;
};
export type SessionSnapshot = {
	steps: BoundStep[];
	recipe: Recipe;
	settings: GameSettings;
	seed: number;
	grade: string;
	selectedWords: Array<{ id: string; word: string; source: 'custom' | 'grade_list' | 'cooking' }>;
};
