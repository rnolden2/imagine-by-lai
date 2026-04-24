<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { theme } from '$lib/stores';
	import LoadingGame from '$lib/components/LoadingGame.svelte';

	export let data: PageData;
	export let form: ActionData;
	let isGenerating = false;
	let selectedUserId: number | null = null;

	function selectUser(user: typeof data.users[0]) {
		selectedUserId = user.id;
		if (user.gender === 'boy') {
			$theme = 'theme-boy';
		} else {
			$theme = 'theme-girl';
		}
	}
</script>

<div class="min-h-screen bg-gray-100 flex flex-col items-center justify-center pt-10">
	<!-- User Selection -->
	{#if data.users && data.users.length > 0}
		<div class="mb-8">
			<h2 class="text-xl font-semibold text-center mb-4">Who is reading?</h2>
			<div class="flex gap-4">
				{#each data.users as user}
					<button
						on:click={() => selectUser(user)}
						class="px-6 py-3 rounded-lg shadow font-bold text-black bg-primary hover:opacity-90 transition-all"
						class:ring-4={selectedUserId === user.id}
						class:ring-secondary={selectedUserId === user.id}
					>
						{user.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
		<h1 class="text-3xl font-bold text-center text-primary">Create a New Story</h1>
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
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
					placeholder="An adventurous princess who befriends a friendly dragon..."
					required
					disabled={isGenerating}
				></textarea>
			</div>
			<div>
				<button
					type="submit"
					class="w-full flex justify-center py-3 px-4 border border-black rounded-md shadow-sm text-sm font-medium text-black bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-70 transition-opacity"
					disabled={isGenerating}
				>
					Generate Story
				</button>
			</div>
		</form>

		{#if form?.error && !isGenerating}
			<p class="text-red-500 text-sm text-center">{form.error}</p>
		{/if}
	</div>

	<!-- Load Stories Button (when no stories exist) -->
	{#if data.stories && data.stories.length === 0 && data.latestBackup}
		<div class="w-full max-w-md mx-auto mt-8">
			<div class="bg-primary/10 border-2 border-primary/30 rounded-2xl p-8 text-center">
				<p class="text-2xl font-bold text-gray-800 mb-2">Your old stories are waiting!</p>
				<p class="text-gray-600 mb-6">
					Saved on {new Date(data.latestBackup.timeCreated).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
				</p>
				<form method="POST" action="?/loadStoriesFromBackup">
					<button
						type="submit"
						class="px-8 py-3 bg-primary text-black rounded-xl font-bold shadow-md hover:opacity-90 transition-opacity text-lg"
					>
						Bring Them Back!
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Recent Stories -->
	{#if data.stories && data.stories.length > 0}
		<div class="w-full max-w-5xl mx-auto mt-12 px-4 pb-12">
			<h2 class="text-2xl font-bold text-center mb-6">Recently Created Stories</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
				{#each data.stories as story}
					<a
						href="/story/{story.id}"
						class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
					>
						<img
							src={story.image_url || 'https://via.placeholder.com/400x300?text=No+Image'}
							alt="Story illustration"
							class="w-full h-40 object-cover"
						/>
						<div class="p-4">
							<p class="text-sm text-gray-700 truncate">"{story.prompt}"</p>
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
