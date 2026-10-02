import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { generateGameImage, generateGamePlan } from '$lib/server/ai';
import { vocabularySchema, validateRecipe, type Recipe } from '$lib/games/word-kitchen/contracts';
import { buildRecipe, concepts, conceptMap, stableId } from './curated';
import { learningContext } from './learning-context';
import { compatible } from './sessions';
import { checkResult, rpc, hash } from './common';
import { publishGeneratedAsset } from './assets';

const ingredient = z
	.object({
		label: z.string().min(1).max(40),
		canonicalId: z.string().regex(/^ingredient:[a-z0-9-]+$/),
		tags: z
			.array(
				z.enum([
					'fruit',
					'vegetable',
					'wheat',
					'dairy',
					'egg',
					'nuts',
					'soy',
					'seafood',
					'meat',
					'herb',
					'sweetener'
				])
			)
			.max(10)
	})
	.strict();
export const planSchema = z
	.object({
		supported: z.boolean(),
		reason: z.string().max(300),
		title: z.string().min(1).max(80),
		description: z.string().min(1).max(400),
		ingredients: z.array(ingredient).min(3).max(4),
		vocabulary: z.array(vocabularySchema).min(4).max(8),
		actions: z
			.array(
				z
					.object({
						mechanic: z.enum([
							'slice',
							'whisk',
							'pour',
							'stir',
							'measure',
							'drag_to_bowl',
							'timer'
						]),
						label: z.string().min(1).max(100),
						object: z.enum(['tool:bowl', 'tool:cup', 'tool:pan', 'tool:plate']),
						state: z.string().regex(/^[a-z-]{1,40}$/)
					})
					.strict()
			)
			.min(2)
			.max(5)
	})
	.strict();
type Plan = z.infer<typeof planSchema>;
type Job = {
	id: string;
	child_id: number;
	recipe_id: string | null;
	input: {
		favoriteName: string;
		settings: Awaited<ReturnType<typeof learningContext>>['settings'];
		grade: string;
	};
	stage: string;
	status: string;
	lease_token: number;
	attempts: number;
	checkpoint: { plan?: Plan; recipe?: Recipe; assetIndex?: number; newAssets?: number };
};
export const generationPolicy = {
	jobCap: 2,
	dayCap: 5,
	dailyJobs: 5,
	imageReservation: 0.15,
	textReservation: 0.3,
	maxNewAssets: 12
};
export function requireWorkerConfig() {
	for (const key of [
		'WORD_KITCHEN_TASK_QUEUE',
		'WORD_KITCHEN_WORKER_URL',
		'WORD_KITCHEN_WORKER_SERVICE_ACCOUNT'
	])
		if (!env[key]) error(503, 'Game generation is not configured yet.');
}
export async function enqueueGeneration(childId: number, favoriteId: string, key: string) {
	requireWorkerConfig();
	const db = await getSupabase();
	const favorite = checkResult(
		await db
			.from('game_favorite_foods')
			.select('display_name')
			.eq('id', favoriteId)
			.eq('child_id', childId)
			.maybeSingle()
	);
	if (!favorite) error(404, 'Favorite not found.');
	const context = await learningContext(childId);
	const input = {
		favoriteName: favorite.display_name,
		settings: context.settings,
		grade: context.child.grade
	};
	return rpc<Job>('wk_enqueue_job', {
		p_id: randomUUID(),
		p_child: childId,
		p_key: key,
		p_hash: hash({ favoriteId, childId }),
		p_input: input,
		p_daily: generationPolicy.dailyJobs
	});
}
async function checkpoint(
	job: Job,
	stage: string,
	status = stage,
	reason: string | null = null,
	delay = 0
) {
	return rpc('wk_checkpoint_job', {
		p_id: job.id,
		p_token: job.lease_token,
		p_stage: stage,
		p_status: status,
		p_checkpoint: job.checkpoint,
		p_error: reason,
		p_delay: delay
	});
}
async function reserve(job: Job, key: string, estimate: number) {
	const fresh = await rpc<boolean>('wk_reserve_cost', {
		p_job: job.id,
		p_key: `${job.id}:${key}`,
		p_estimate: estimate,
		p_job_cap: generationPolicy.jobCap,
		p_day_cap: generationPolicy.dayCap
	});
	// A lost provider response is not automatically purchased again.
	if (!fresh) throw new Error('UNCERTAIN_PROVIDER_RESULT');
}
export async function assetIdentity(conceptId: string, state = 'whole') {
	const db = await getSupabase();
	const identity = {
		id: stableId(`identity:${conceptId}:${state}`),
		concept_id: conceptId,
		state,
		style: 'word-kitchen-v1',
		view: 'three-quarter',
		contract: 'kitchen-asset.v1'
	};
	checkResult(
		await db
			.from('kitchen_asset_identities')
			.upsert(identity, {
				onConflict: 'concept_id,state,style,view,contract',
				ignoreDuplicates: true
			})
	);
	return checkResult(
		await db
			.from('kitchen_asset_identities')
			.select('*')
			.eq('concept_id', conceptId)
			.eq('state', state)
			.eq('style', identity.style)
			.eq('view', identity.view)
			.eq('contract', identity.contract)
			.single()
	)!;
}
export const assetPrompt = (label: string, state = 'whole') =>
	`One ${label}, state ${state}. A polished storybook cooking-game sprite for young children. Soft rounded illustrated forms, warm cream and teal palette with natural food colors, consistent three-quarter view, gentle upper-left lighting. Centered object fully within frame, 15 percent transparent padding. No text, logo, people, extra props, knife, fire, cast shadow, background or checkerboard. Real alpha transparency. Recognizable accurate silhouette. Isolated single object.`;
async function registerPlan(job: Job, plan: Plan) {
	const db = await getSupabase();
	const seen = new Set<string>();
	for (const item of plan.ingredients) {
		if (seen.has(item.canonicalId)) throw new Error('INVALID_PLAN');
		seen.add(item.canonicalId);
		const alias = item.label.normalize('NFKC').trim().toLowerCase();
		const matches =
			checkResult(
				await db
					.from('kitchen_concept_aliases')
					.select('concept_id')
					.eq('locale', 'en-US')
					.eq('alias', alias)
			) ?? [];
		if (
			new Set(matches.map((m) => m.concept_id)).size > 1 ||
			(matches.length && matches[0].concept_id !== item.canonicalId)
		)
			throw new Error('AMBIGUOUS_CONCEPT');
		const existing = checkResult(
			await db.from('kitchen_concepts').select('*').eq('id', item.canonicalId).maybeSingle()
		);
		const concept = existing ?? {
			id: item.canonicalId,
			label: item.label,
			kind: 'ingredient',
			tags: item.tags
		};
		if (!existing) checkResult(await db.from('kitchen_concepts').insert(concept));
		checkResult(
			await db
				.from('kitchen_concept_aliases')
				.upsert(
					{ locale: 'en-US', alias, concept_id: concept.id, qualifier: '' },
					{ onConflict: 'locale,alias,concept_id,qualifier' }
				)
		);
		conceptMap.set(concept.id, concept);
	}
	const slug = `generated-${job.id}`;
	const dish = { id: `dish:${slug}`, kind: 'dish', label: plan.title, tags: [] };
	checkResult(await db.from('kitchen_concepts').upsert(dish));
	conceptMap.set(dish.id, dish);
	const recipe = buildRecipe({
		slug,
		title: plan.title,
		description: plan.description,
		ingredients: plan.ingredients.map((i) => i.canonicalId.slice(11)),
		vocabulary: plan.vocabulary,
		actions: plan.actions
	});
	// First challenge names the first ingredient, so its evidence must name the same concept.
	const first = plan.ingredients[0];
	recipe.vocabulary[0] = {
		...recipe.vocabulary[0],
		word: first.label,
		conceptId: first.canonicalId
	};
	if (!compatible(recipe, job.input.settings.excludedFoodConceptIds))
		throw new Error('RECIPE_BLOCKED');
	return validateRecipe(recipe);
}
async function withHeartbeat<T>(job:Job,work:()=>Promise<T>,asset?:{id:string;token:number}):Promise<T>{
 let lost=false;const timer=setInterval(()=>{void rpc<boolean>('wk_heartbeat',{p_job:job.id,p_token:job.lease_token,p_asset:asset?.id??null,p_asset_token:asset?.token??null}).then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;});},60000);
 try{const result=await work();if(lost)throw new Error('STALE_LEASE');return result;}finally{clearInterval(timer);}
}
export async function runGeneration(jobId: string) {
	const job = await rpc<Job | null>('wk_claim_job', { p_id: jobId });
	if (!job) return;
	const db = await getSupabase();
	try {
		const context = await learningContext(Number(job.child_id));
		if (context.settings.revision !== job.input.settings.revision)
			throw new Error('PREFERENCES_CHANGED');
		switch (job.stage) {
			case 'planning': {
				await reserve(job, 'planning', generationPolicy.textReservation);
				const prompt = JSON.stringify({
					task: 'Design a coherent pretend recipe game around the favorite food. If ambiguous, not food, unsafe, or incompatible with exclusions, set supported=false with a helpful reason. Choose three or four core ingredients and two to five simple actions. All ingredients must use canonical ingredient:lowercase-hyphen IDs; reuse supplied concepts. Vocabulary must start with the first ingredient, include bowl and plate, and have 4–8 words. Avoid real cooking guidance. Tags must include every relevant food exclusion. Do not invent substitutions that alter the requested favorite without review.',
					favorite: job.input.favoriteName,
					grade: job.input.grade,
					excluded: job.input.settings.excludedFoodConceptIds,
					knownConcepts: concepts
				});
				// Zod's optional fields are normalized to nullable-free required properties for strict output.
				const schema = z.toJSONSchema(planSchema) as Record<string, unknown>;
				const strict = (node: unknown) => {
					if (!node || typeof node !== 'object') return;
					const n = node as Record<string, unknown>;
					if (n.type === 'object' && n.properties) n.required = Object.keys(n.properties as object);
					for (const value of Object.values(n))
						if (Array.isArray(value)) value.forEach(strict);
						else strict(value);
				};
				strict(schema);
				job.checkpoint.plan = planSchema.parse(await withHeartbeat(job,()=>generateGamePlan(prompt, schema)));
				if (!job.checkpoint.plan.supported) {
					await checkpoint(job, 'planning', 'needs_parent_input', 'UNSUPPORTED_FAVORITE');
					return;
				}
				await checkpoint(job, 'composing');
				break;
			}
			case 'composing':
				job.checkpoint.recipe = await registerPlan(job, planSchema.parse(job.checkpoint.plan));
				job.checkpoint.assetIndex = 0;
				job.checkpoint.newAssets = 0;
				await checkpoint(job, 'resolving_assets');
				break;
			case 'resolving_assets':
			case 'generating_assets': {
				const recipe = validateRecipe(job.checkpoint.recipe);
				const index = job.checkpoint.assetIndex ?? 0;
				if (index >= recipe.assetRequirements.length) {
					await checkpoint(job, 'validating');
					break;
				}
				const requirement = recipe.assetRequirements[index];
				const identity = await assetIdentity(requirement.conceptId, requirement.state);
				checkResult(
					await db
						.from('game_generation_job_assets')
						.upsert(
							{ job_id: job.id, identity_id: identity.id },
							{ onConflict: 'job_id,identity_id' }
						)
				);
				let revisionId = identity.ready_revision_id as string | null;
				if (!revisionId) {
					if ((job.checkpoint.newAssets ?? 0) >= generationPolicy.maxNewAssets)
						throw new Error('ASSET_LIMIT');
					const lease = await rpc<{ lease_token: number; ready_revision_id: string | null } | null>(
						'wk_claim_asset',
						{ p_identity: identity.id }
					);
					if (!lease) {
						await checkpoint(job, 'generating_assets', 'retry_wait', null, 30);
						return;
					}
					if (lease.ready_revision_id) revisionId = lease.ready_revision_id;
					else {
						await reserve(job, `asset:${identity.id}`, generationPolicy.imageReservation);
						const concept = checkResult(
							await db
								.from('kitchen_concepts')
								.select('label')
								.eq('id', requirement.conceptId)
								.single()
						);
						const bytes = await withHeartbeat(job,()=>generateGameImage(
							assetPrompt(concept!.label, requirement.state),
							!requirement.conceptId.startsWith('environment:')
						),{id:identity.id,token:lease.lease_token});
						revisionId = await publishGeneratedAsset(
							identity.id,
							lease.lease_token,
							bytes,
							{ jobId: job.id, provider: env.AI_PROVIDER ?? 'openai' },
							requirement.conceptId.startsWith('environment:')
						);
						job.checkpoint.newAssets = (job.checkpoint.newAssets ?? 0) + 1;
					}
				}
				if (recipe.heroAssetId === requirement.assetRevisionId) recipe.heroAssetId = revisionId!;
				requirement.assetRevisionId = revisionId!;
				job.checkpoint.recipe = recipe;
				job.checkpoint.assetIndex = index + 1;
				checkResult(
					await db
						.from('game_generation_job_assets')
						.update({ status: 'ready' })
						.eq('job_id', job.id)
						.eq('identity_id', identity.id)
				);
				await checkpoint(job, 'generating_assets');
				break;
			}
			case 'validating': {
				const recipe = validateRecipe(job.checkpoint.recipe);
				if (!compatible(recipe, context.settings.excludedFoodConceptIds))
					throw new Error('RECIPE_BLOCKED');
				await rpc('wk_store_draft', {
					p_job: job.id,
					p_token: job.lease_token,
					p_recipe: recipe,
					p_checksum: hash(recipe),
					p_preferences: context.settings.revision
				});
				await checkpoint(job, 'ready_for_preview');
				break;
			}
			default:
				throw new Error('INVALID_STAGE');
		}
	} catch (cause) {
		const providerCode=(cause as {code?:string})?.code;
 const code=providerCode==='credit_balance_exhausted'||providerCode==='insufficient_quota'?'PROVIDER_CREDITS_EXHAUSTED':(cause as {body?:{message?:string}})?.body?.message??(cause instanceof Error?cause.message:'GENERATION_FAILED');
		const parentCodes = ['AMBIGUOUS_CONCEPT', 'RECIPE_BLOCKED', 'PREFERENCES_CHANGED'];
		const terminal =
			parentCodes.includes(code) ||
			code.includes('BUDGET') ||
			code === 'UNCERTAIN_PROVIDER_RESULT' ||
			code === 'ASSET_LIMIT'||code==='PROVIDER_CREDITS_EXHAUSTED'||code==='STALE_LEASE';
		console.error('word-kitchen.generation', {
			jobId: job.id,
			stage: job.stage,
			code: terminal ? code : 'GENERATION_FAILED'
		});
		await checkpoint(
			job,
			job.stage,
			parentCodes.includes(code)
				? 'needs_parent_input'
				: terminal || job.attempts >= 2
					? 'failed'
					: 'retry_wait',
			terminal ? code : 'GENERATION_FAILED',
			Math.min(120, 15 * 2 ** job.attempts)
		);
	}
}
