// Reusable bootstrap for local artwork preparation and database installation.
// No credentials or private child data are written to generated files.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
const generate = process.argv.includes('--generate-assets');
const seed = process.argv.includes('--database');
const prepare = process.argv.includes('--prepare-assets');
if (!generate && !seed && !prepare) {
	console.error(
		'Use --generate-assets to prepare paid shared artwork, or --database to install verified assets and starter recipes.'
	);
	process.exit(1);
}
const server = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
try {
	const { concepts, curatedRecipes, stableId } = await server.ssrLoadModule(
		'/src/lib/server/games/curated.ts'
	);
	const { processMaster } = await server.ssrLoadModule('/src/lib/server/games/assets.ts');
	const { generateGameImage } = await server.ssrLoadModule('/src/lib/server/ai.ts');
	const { assetPrompt } = await server.ssrLoadModule('/src/lib/server/games/generation.ts');
	const { hash } = await server.ssrLoadModule('/src/lib/server/games/common.ts');
	const root = path.resolve('static/word-kitchen');
	await fs.mkdir(root, { recursive: true });
	const used = [
		...new Set(curatedRecipes.flatMap((r) => r.assetRequirements.map((a) => a.conceptId)))
	];
	if (generate || prepare) {
		let cursor = 0;
		await Promise.all(
			Array.from({ length: 3 }, async () => {
				while (cursor < used.length) {
					const conceptId = used[cursor++];
					const concept = concepts.find((c) => c.id === conceptId);
					const revisionId = stableId(`asset:${conceptId}:whole`);
					const folder = path.join(root, revisionId);
					const reportPath = path.join(folder, 'asset.json');
					try {
						const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
						if (report.metadata?.sha256) {
							console.log(`Reusing verified ${concept.label}`);
							continue;
						}
					} catch {}
					await fs.mkdir(folder, { recursive: true });
					console.log(`${generate ? 'Preparing' : 'Packaging'} shared artwork: ${concept.label}`);
					let bytes;
					try {
						bytes = await fs.readFile(
							path.join('resources/word-kitchen/masters', conceptId.replace(':', '-') + '.png')
						);
					} catch {
						if (!generate) throw new Error('MISSING_MASTER: ' + conceptId);
						const background = concept.kind === 'environment';
						const prompt = background
							? 'A warm illustrated pretend kitchen for a children’s word game. Teal cabinets, pale cream walls, wooden counter, soft morning light. No people, text, logos, knives, fire, or loose objects. Three-quarter view, friendly storybook art, empty central counter for placing sprites.'
							: assetPrompt(concept.label);
						bytes = await generateGameImage(prompt, !background);
						await fs.writeFile(path.join(folder, 'provider-master.png'), bytes);
					}
					const result = await processMaster(bytes, concept.kind === 'environment');
					await fs.writeFile(path.join(folder, 'master.png'), result.master);
					const variants = [];
					for (const variant of result.variants) {
						await fs.writeFile(path.join(folder, `${variant.label}.webp`), variant.bytes);
						variants.push({
							label: variant.label,
							object_path: `static/word-kitchen/${revisionId}/${variant.label}.webp`,
							generation: 'bundled-v1',
							metadata: {
								width: variant.width,
								height: variant.width,
								bytes: variant.bytes.length,
								mime: 'image/webp'
							}
						});
					}
					await fs.writeFile(
						reportPath,
						JSON.stringify(
							{
								conceptId,
								revisionId,
								identityId: stableId(`identity:${conceptId}:whole`),
								metadata: result.metadata,
								report: result.report,
								variants
							},
							null,
							2
						)
					);
					console.log(`Verified and saved ${concept.label}`);
				}
			})
		);
	}
	const reports = [];
	for (const conceptId of used) {
		const revisionId = stableId(`asset:${conceptId}:whole`);
		reports.push(JSON.parse(await fs.readFile(path.join(root, revisionId, 'asset.json'), 'utf8')));
	}
	// Fixture and deployment seed share exactly the same validated content.
	const content = {
		concepts: concepts.filter((c) => used.includes(c.id)),
		recipes: curatedRecipes.map((r) => ({ definition: r, checksum: hash(r) })),
		assets: reports
	};
	await fs.mkdir('resources/word-kitchen', { recursive: true });
	await fs.writeFile('resources/word-kitchen/seed.json', JSON.stringify(content, null, 2));
	if (seed) {
		const { getSupabase } = await server.ssrLoadModule('/src/lib/server/db/index.ts');
		const db = await getSupabase();
		const check = (r) => {
			if (r.error) throw new Error(`Seed operation failed (${r.error.code}).`);
			return r.data;
		};
		check(await db.from('kitchen_concepts').upsert(content.concepts));
		for (const c of content.concepts)
			check(
				await db
					.from('kitchen_concept_aliases')
					.upsert(
						{ locale: 'en-US', alias: c.label.toLowerCase(), concept_id: c.id, qualifier: '' },
						{ onConflict: 'locale,alias,concept_id,qualifier' }
					)
			);
		for (const asset of reports) {
			check(
				await db
					.from('kitchen_asset_identities')
					.upsert(
						{
							id: asset.identityId,
							concept_id: asset.conceptId,
							state: 'whole',
							style: 'word-kitchen-v1',
							view: 'three-quarter',
							contract: 'kitchen-asset.v1'
						},
						{ ignoreDuplicates: true }
					)
			);
			check(
				await db
					.from('kitchen_asset_revisions')
					.upsert(
						{
							id: asset.revisionId,
							identity_id: asset.identityId,
							revision: 1,
							metadata: asset.metadata,
							report: asset.report,
							ready: true
						},
						{ ignoreDuplicates: true }
					)
			);
			check(
				await db.from('kitchen_asset_variants').upsert(
					asset.variants.map((v) => ({ ...v, revision_id: asset.revisionId })),
					{ onConflict: 'revision_id,label', ignoreDuplicates: true }
				)
			);
			check(
				await db
					.from('kitchen_asset_identities')
					.update({ status: 'ready', ready_revision_id: asset.revisionId })
					.eq('id', asset.identityId)
					.is('ready_revision_id', null)
			);
		}
		for (const { definition: r, checksum } of content.recipes) {
			check(
				await db
					.from('game_recipes')
					.upsert(
						{ id: r.recipeId, slug: r.title.toLowerCase().replaceAll(' ', '-'), origin: 'curated' },
						{ ignoreDuplicates: true }
					)
			);
			check(
				await db
					.from('game_recipe_revisions')
					.upsert(
						{
							id: r.revisionId,
							recipe_id: r.recipeId,
							revision: 1,
							definition: r,
							checksum,
							status: 'published',
							report: { validated: true }
						},
						{ ignoreDuplicates: true }
					)
			);
			check(
				await db
					.from('game_recipes')
					.update({ published_revision_id: r.revisionId })
					.eq('id', r.recipeId)
					.is('published_revision_id', null)
			);
		}
		console.log('Starter recipes and verified shared assets installed.');
	}
	console.log(
		`Bootstrap complete: ${content.recipes.length} recipes, ${reports.length} immutable artwork revisions.`
	);
} finally {
	await server.close();
}
