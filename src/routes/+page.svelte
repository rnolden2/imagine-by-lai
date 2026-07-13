<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { theme } from '$lib/stores';
	import LoadingGame from '$lib/components/LoadingGame.svelte';

	export let data: PageData;
	export let form: ActionData;
	const storyThemeOptions = ['space', 'animals', 'travel', 'food', 'fairy-tales', 'superheroes'];
	let isGenerating = false;
	let selectedUserId: number | null = null;
	let selectedStoryThemes: string[] = [];
	let customStoryTheme = '';
	let useNoTheme = false;
	let initializedForUserId: number | null = null;

	$: selectedUser = data.users.find((user) => user.id === selectedUserId) ?? null;
	$: if (selectedUser?.id !== initializedForUserId) {
		initializedForUserId = selectedUser?.id ?? null;
		selectedStoryThemes = selectedUser?.story_themes ? [...selectedUser.story_themes] : [];
		customStoryTheme = '';
		useNoTheme = false;
	}
	$: effectiveStoryThemes = useNoTheme
		? []
		: [
				...selectedStoryThemes,
				...(customStoryTheme.trim() ? [customStoryTheme.trim()] : [])
			];

	function selectUser(user: (typeof data.users)[0]) {
		selectedUserId = user.id;
		if (user.gender === 'boy') {
			$theme = 'theme-boy';
		} else {
			$theme = 'theme-girl';
		}
	}

	function clearThemes() {
		useNoTheme = true;
		selectedStoryThemes = [];
		customStoryTheme = '';
	}

	function enableThemes() {
		useNoTheme = false;
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-100 pt-10">
	<!-- User Selection -->
	{#if data.users && data.users.length > 0}
		<div class="mb-8 px-4">
			<h2 class="mb-4 text-center text-xl font-semibold">Who is reading?</h2>
			<div class="flex flex-wrap justify-center gap-4">
				{#each data.users as user (user.id)}
					<button
						on:click={() => selectUser(user)}
						class="min-w-32 rounded-2xl border-4 bg-white px-6 py-4 font-bold text-black shadow transition-all hover:-translate-y-1 hover:shadow-lg"
						class:ring-4={selectedUserId === user.id}
						class:border-primary={selectedUserId === user.id}
						class:border-transparent={selectedUserId !== user.id}
					>
						<span class="block text-lg">{user.name}</span>
						<span class="block text-xs text-gray-500">Grade {user.grade}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="w-full max-w-xl space-y-6 rounded-2xl bg-white p-8 shadow-md">
		<h1 class="text-primary text-center text-3xl font-bold">Create a New Story</h1>
		{#if selectedUser}
			<div class="bg-primary/10 rounded-xl p-4">
				<p class="font-black text-gray-800">{selectedUser.name}'s story settings</p>
				<p class="text-sm text-gray-600">
					Themes: {effectiveStoryThemes.length > 0 ? effectiveStoryThemes.join(', ') : 'No theme'}
				</p>
				{#if selectedUser.character_description}
					<p class="text-sm text-gray-600">Character look: {selectedUser.character_description}</p>
				{/if}
			</div>
		{/if}
		<form
			method="POST"
			action="?/generateStory"
			class="space-y-6"
			use:enhance={() => {
				isGenerating = true;
				return async ({ update }) => {
					await update();
					isGenerating = false;
				};
			}}
		>
			{#if selectedUserId !== null}
				<input type="hidden" name="userId" value={selectedUserId} />
			{/if}
			<div>
				<label for="prompt" class="block text-sm font-medium text-gray-700"
					>What should the story be about?</label
				>
				<textarea
					id="prompt"
					name="prompt"
					rows="4"
					class="focus:border-primary focus:ring-primary mt-1 block w-full rounded-xl border-gray-300 shadow-sm sm:text-sm"
					placeholder="An adventurous princess who befriends a friendly dragon..."
					required
					disabled={isGenerating}
				></textarea>
			</div>
			{#if selectedUser}
				<div>
					<div class="mb-2 flex items-center justify-between gap-3">
						<p class="block text-sm font-medium text-gray-700">Story themes</p>
						<button
							type="button"
							class="rounded-full border border-gray-300 px-3 py-1 text-xs font-bold text-gray-700 disabled:opacity-60"
							on:click={clearThemes}
							disabled={isGenerating || useNoTheme}
						>
							No theme
						</button>
					</div>

					{#if useNoTheme}
						<input type="hidden" name="noTheme" value="true" />
					{/if}

					<div class="flex flex-wrap gap-2">
						{#each storyThemeOptions as storyTheme (storyTheme)}
							<label
								class="rounded-full border border-gray-200 px-3 py-2 text-sm font-bold"
								class:opacity-50={useNoTheme}
							>
								<input
									type="checkbox"
									name="storyThemes"
									value={storyTheme}
									class="mr-1"
									bind:group={selectedStoryThemes}
									on:change={enableThemes}
									disabled={isGenerating || useNoTheme}
								/>
								{storyTheme}
							</label>
						{/each}
					</div>
					<label for="customStoryTheme" class="mt-3 block text-sm font-medium text-gray-700">
						Custom theme
					</label>
					<input
						id="customStoryTheme"
						name="customStoryTheme"
						type="text"
						class="focus:border-primary focus:ring-primary mt-1 block w-full rounded-xl border-gray-300 shadow-sm sm:text-sm"
						placeholder="dinosaurs, ocean mystery, music..."
						bind:value={customStoryTheme}
						on:input={enableThemes}
						disabled={isGenerating || useNoTheme}
					/>
					<p class="mt-2 text-xs text-gray-500">
						Leave every theme blank or choose No theme to let the prompt stand on its own.
					</p>
				</div>
			{/if}
			<div>
				<button
					type="submit"
					class="bg-primary focus:ring-primary flex w-full justify-center rounded-2xl border border-black px-4 py-4 text-lg font-black text-black shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-70"
					disabled={isGenerating}
				>
					Generate Story
				</button>
			</div>
		</form>

		{#if form?.error && !isGenerating}
			<p class="text-center text-sm text-red-500">{form.error}</p>
		{/if}
	</div>

	<!-- Recent Stories -->
	{#if data.stories && data.stories.length > 0}
		<div class="mx-auto mt-12 w-full max-w-5xl px-4 pb-12">
			<h2 class="mb-6 text-center text-2xl font-bold">Recently Created Stories</h2>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{#each data.stories as story (story.id)}
					<a
						href="/story/{story.id}"
						class="overflow-hidden rounded-lg bg-white shadow-md transition-shadow hover:shadow-xl"
					>
						<img
							src={story.image_url}
							alt="Story illustration"
							class="h-40 w-full object-cover"
						/>
						<div class="p-4">
							<p class="truncate text-sm text-gray-700">"{story.prompt}"</p>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

{#if isGenerating}
	<LoadingGame />
{/if}
