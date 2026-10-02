<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let selected = $state(0);
	let duration = $state<5 | 8 | 10>(5);
	let reviewed = $state(false);
	let busy = $state(false);
	let message = $state('');
	const childId = $derived(Number(data.owner?.child_id ?? (selected || data.children[0]?.id)));
	async function request(body: Record<string, unknown>, preview = false) {
		busy = true;
		message = '';
		try {
			const r = await fetch(preview ? '/api/games/word-kitchen/start' : '/api/settings/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const b = await r.json();
			if (!r.ok) throw new Error(b.message ?? 'Could not save.');
			if (preview) await goto(`/games/word-kitchen/session/${b.id}`);
			else if(body.action==='revise'){await goto(`/settings/games/word-kitchen/recipes/${b.id}/preview`);} else {
				await invalidateAll();
				message = 'Saved.';
			}
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connection interrupted.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Review {data.recipe.title} · Parent kitchen</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-10">
	<a class="font-bold text-teal-800" href="/settings/games/word-kitchen/recipes">← Recipe reviews</a
	>
	<h1 class="my-6 text-4xl font-extrabold">{data.recipe.title}</h1>
	<p>{data.recipe.description}</p>
	<p class="mt-3 text-sm">
		Revision {data.revision.revision} · {data.revision.status.replaceAll('_', ' ')} · Approval applies
		only to this exact revision.
	</p>
	<div class="my-8 flex flex-wrap gap-3">
		{#each Object.values(data.manifest) as asset}<figure
				class="rounded-xl bg-white p-3 text-center"
			>
				<img
					src={asset.url}
					alt={asset.label}
					width="100"
					height="100"
					class="h-24 w-24 object-contain"
				/>
				<figcaption class="text-sm">{asset.label}</figcaption>
			</figure>{/each}
	</div>
	<h2 class="text-2xl font-bold">Words & meanings</h2>
	<dl class="my-4 grid gap-3 md:grid-cols-2">
		{#each data.recipe.vocabulary as word}<div class="rounded-xl bg-white p-4">
				<dt class="font-bold">{word.word}</dt>
				<dd>{word.definition}</dd>
			</div>{/each}
	</dl>
	{#if data.owner?.origin==='generated'&&!data.owner.archived_at}<details class="my-8 rounded-2xl bg-white p-5"><summary class="cursor-pointer font-bold">Edit a new revision</summary><form class="mt-5 space-y-4" onsubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void request({action:'revise',revisionId:data.revision.id,checksum:data.revision.checksum,title:f.get('title'),description:f.get('description'),definitions:data.recipe.vocabulary.map(v=>({id:v.id,definition:f.get(`definition-${v.id}`)}))});}}><label class="block">Recipe title<input name="title" value={data.recipe.title} maxlength="80" required class="mt-2 w-full rounded-xl" /></label><label class="block">Description<textarea name="description" maxlength="400" required class="mt-2 w-full rounded-xl">{data.recipe.description}</textarea></label>{#each data.recipe.vocabulary as word}<label class="block">Meaning of {word.word}<input name={`definition-${word.id}`} value={word.definition} maxlength="240" required class="mt-2 w-full rounded-xl" /></label>{/each}<p class="text-sm">Edits create a new revision for review. Existing games keep their original words and pictures.</p><button class="rounded-xl bg-teal-800 px-5 py-3 font-bold text-white" disabled={busy}>Save new revision</button></form></details>{/if}<h2 class="mt-8 text-2xl font-bold">Try the game</h2>
	<div class="my-5 flex flex-wrap items-center gap-4">
		{#if !data.owner?.child_id}<label
				>Preview as <select bind:value={selected} class="rounded-lg"
					><option value={0}>Choose child</option>{#each data.children as c}<option
							value={Number(c.id)}>{c.name}</option
						>{/each}</select
				></label
			>{/if}<label
			>Duration <select bind:value={duration} class="rounded-lg"
				><option value={5}>5 minutes</option><option value={8}>8 minutes</option><option value={10}
					>10 minutes</option
				></select
			></label
		><button
			class="rounded-xl bg-teal-800 px-5 py-3 font-bold text-white"
			disabled={busy || !childId}
			onclick={() =>
				request(
					{
						childId,
						revisionId: data.revision.id,
						duration,
						key: crypto.randomUUID(),
						preview: true
					},
					true
				)}>Play preview</button
		>
	</div>
	<p class="text-sm">Preview does not change learning results or award points.</p>
	<details class="my-8">
		<summary class="cursor-pointer font-bold">Review the {duration}-minute sequence</summary>
		<ol class="mt-4 list-decimal pl-6">
			{#each data.recipe.steps.filter((s) => s.durationPresets.includes(duration)) as step}<li
					class="py-2"
				>
					{step.instruction}
					<span class="text-sm text-slate-500">({step.mechanic.replaceAll('_', ' ')})</span>
				</li>{/each}
		</ol>
	</details>
	{#if data.revision.status === 'ready_for_preview'}<label class="block"
			><input type="checkbox" bind:checked={reviewed} /> I reviewed the pictures, words, and play sequence
			for my child.</label
		><button
			class="mt-5 rounded-xl bg-teal-800 px-6 py-3 font-bold text-white"
			disabled={!reviewed || busy}
			onclick={() =>
				request({
					action: 'approve',
					childId,
					revisionId: data.revision.id,
					checksum: data.revision.checksum,
					preferenceRevision: data.revision.preference_revision
				})}>Approve and publish</button
		>{/if}{#if data.owner?.origin === 'generated' && !data.owner.archived_at}<button
			class="mt-5 ml-4 rounded-xl border px-5 py-3"
			disabled={busy}
			onclick={() => request({ action: 'archive', recipeId: data.revision.recipe_id })}
			>Archive recipe</button
		>{/if}
	<p role="status" class="mt-4">{message}</p>
</section>
