<script lang="ts">
	import GenerationAllowance from '$lib/games/word-kitchen/GenerationAllowance.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Recipe reviews · Word Kitchen</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-10">
	<a href="/settings/games" class="font-bold text-teal-800">← Parent kitchen</a>
	<h1 class="my-6 text-4xl font-extrabold">Recipe reviews</h1>
	<p class="mb-8">
		Generate a recipe from a favorite food in the parent kitchen. Every generated recipe needs your
		review.
	</p>
	<GenerationAllowance quota={data.generationQuota} />
	<h2 class="text-2xl font-bold">Generation jobs</h2>
	{#each data.jobs as job}<a
			class="my-3 block rounded-xl bg-white p-5 shadow-sm"
			href={`/settings/games/word-kitchen/jobs/${job.id}`}
			><strong>{job.input.favoriteName ?? 'New recipe'}</strong> · {job.status.replaceAll('_', ' ')}
			<span class="float-right">View →</span></a
		>{:else}<p class="my-5">No generation jobs yet.</p>{/each}
	<h2 class="mt-10 text-2xl font-bold">Recipe revisions</h2>
	{#each data.recipes as recipe}<a
			href={`/settings/games/word-kitchen/recipes/${recipe.id}/preview`}
			class="my-3 block rounded-xl bg-white p-5 shadow-sm"
			><strong>{recipe.title}</strong> · {recipe.status.replaceAll('_', ' ')}
			<span class="float-right">Preview →</span></a
		>{/each}
</section>
