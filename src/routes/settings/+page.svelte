<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	let selectedStoryId: string = '';
	let selectedImageUrl: string = '';
	let showImagePreview = false;
	let showCreateStoryModal = false;
	let createStoryImageUrl: string | null = null;
</script>

<h1 class="text-3xl font-bold text-gray-900 px-4 py-3">Admin Settings</h1>

<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
	<!-- User Management -->
	<div class="bg-white p-6 rounded-lg shadow">
		<h2 class="text-xl font-semibold mb-4">Manage Users</h2>
		<!-- Add User Form -->
		<form method="POST" action="?/addUser" class="mb-6 space-y-4">
			<input type="text" name="name" placeholder="User Name" class="input w-full" required />
			<select name="grade" class="select w-full" required>
				<option disabled selected>Select Grade</option>
				{#each ['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8'] as grade}
					<option value={grade}>{grade}</option>
				{/each}
			</select>
			<select name="gender" class="select w-full" required>
				<option disabled selected>Select Gender</option>
				<option value="boy">Boy</option>
				<option value="girl">Girl</option>
			</select>
			<button type="submit" class="btn btn-primary w-full">Add User</button>
		</form>
		<!-- User List -->
		<div class="space-y-2">
			{#each data.users as user}
				<div class="flex justify-between items-center p-2 bg-gray-50 rounded">
					<span>{user.name} ({user.grade}, {user.gender})</span>
					<form method="POST" action="?/deleteUser">
						<input type="hidden" name="id" value={user.id} />
						<button type="submit" class="text-red-500 hover:text-red-700">&times;</button>
					</form>
				</div>
			{/each}
		</div>
	</div>

	<!-- Life Lesson Management -->
	<div class="bg-white p-6 rounded-lg shadow">
		<h2 class="text-xl font-semibold mb-4">Manage Life Lessons</h2>
		<!-- Add Lesson Form -->
		<form method="POST" action="?/addLesson" class="mb-6 flex gap-2">
			<input type="text" name="lesson" placeholder="New life lesson" class="input w-full" required />
			<button type="submit" class="btn btn-primary">Add</button>
		</form>
		<!-- Lesson List -->
		<div class="space-y-2">
			{#each data.lessons as lesson}
				<div class="flex justify-between items-center p-2 bg-gray-50 rounded">
					<span>{lesson.lesson}</span>
					<form method="POST" action="?/deleteLesson">
						<input type="hidden" name="id" value={lesson.id} />
						<button type="submit" class="text-red-500 hover:text-red-700">&times;</button>
					</form>
				</div>
			{/each}
		</div>
	</div>

	<!-- Backup & Restore -->
	<div class="bg-white p-6 rounded-lg shadow col-span-1 md:col-span-2">
		<h2 class="text-xl font-semibold mb-4">Backup & Restore</h2>
		<div class="space-y-4">
			<form method="POST" action="?/backupDatabase" class="flex items-center gap-4">
				<p class="text-gray-600">Save a snapshot of the database to cloud storage.</p>
				<button type="submit" class="btn btn-secondary ml-auto">Backup Database Now</button>
			</form>

			<div class="border-t pt-4">
				<h3 class="font-semibold mb-2">Available Backups</h3>
				<div class="space-y-2 max-h-60 overflow-y-auto">
					{#each data.backups as backup}
						<div class="flex justify-between items-center p-2 bg-gray-50 rounded">
							<div>
								<p class="font-mono text-sm">{backup.name.replace('backups/', '')}</p>
								<p class="text-xs text-gray-500">
									{new Date(backup.timeCreated).toLocaleString()}
								</p>
							</div>
							<form method="POST" action="?/restoreDatabase">
								<input type="hidden" name="fileName" value={backup.name} />
								<button
									type="submit"
									class="btn btn-sm btn-accent"
									on:click={(e) => {
										if (
											!confirm(
												'Are you sure you want to restore this backup? This will overwrite the current database.'
											)
										) {
											e.preventDefault();
										}
									}}>Restore</button
								>
							</form>
						</div>
					{:else}
						<p class="text-gray-500">No backups found.</p>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Story Management -->
	<div class="bg-white p-6 rounded-lg shadow col-span-1 md:col-span-2">
		<h2 class="text-xl font-semibold mb-4">Manage Stories</h2>
		<div class="space-y-2">
			{#each data.stories as story}
				<div class="flex justify-between items-center p-2 bg-gray-50 rounded">
					<a href="/story/{story.id}" class="hover:underline">
						<p class="font-medium">Story #{story.id}</p>
						<p class="text-sm text-gray-600 truncate">"{story.prompt}"</p>
					</a>
					<form method="POST" action="?/deleteStory">
						<input type="hidden" name="id" value={story.id} />
						<button type="submit" class="text-red-500 hover:text-red-700 font-bold text-lg"
							>&times;</button
						>
					</form>
				</div>
			{/each}
		</div>
	</div>

	<!-- Image Assignment -->
	<div class="bg-white p-6 rounded-lg shadow col-span-1 md:col-span-2">
		<h2 class="text-xl font-semibold mb-4">Assign Images to Stories</h2>
		<p class="text-sm text-gray-600 mb-4">
			Sometimes images are generated but not automatically assigned to stories. Use this tool to
			manually assign orphaned images.
		</p>

		{#if data.gcsError}
			<div class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
				<p class="font-semibold">⚠️ Google Cloud Storage Error</p>
				<p class="text-sm mt-1">{data.gcsError}</p>
				<p class="text-sm mt-2">
					Please check your Google Cloud Storage configuration and ensure the service account has
					proper permissions.
				</p>
			</div>
		{/if}

		{#if form?.success && form?.message}
			<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
				{form.message}
				{#if form?.storyId}
					<a href="/story/{form.storyId}" class="underline ml-2">View Story</a>
				{/if}
			</div>
		{/if}

		{#if form?.message && !form?.success}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
				{form.message}
			</div>
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Stories Without Images -->
			<div>
				<h3 class="font-semibold mb-3">Stories Without Images ({data.storiesWithoutImages.length})</h3>
				<div class="space-y-2 max-h-96 overflow-y-auto border rounded p-2">
					{#each data.storiesWithoutImages as story}
						<button
							type="button"
							on:click={() => {
								selectedStoryId = story.id.toString();
							}}
							class="w-full text-left p-3 rounded transition-colors {selectedStoryId ===
							story.id.toString()
								? 'bg-blue-100 border-2 border-blue-500'
								: 'bg-gray-50 hover:bg-gray-100'}"
						>
							<p class="font-medium text-sm">Story #{story.id}</p>
							<p class="text-xs text-gray-600 truncate">"{story.prompt}"</p>
							<p class="text-xs text-gray-500">
								{new Date(story.created_at).toLocaleDateString()}
							</p>
						</button>
					{:else}
						<p class="text-gray-500 text-sm p-4">All stories have images!</p>
					{/each}
				</div>
			</div>

			<!-- Available Images -->
			<div>
				<h3 class="font-semibold mb-3">Unassigned Images ({data.availableImages.length})</h3>
				<div class="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto border rounded p-2">
					{#each data.availableImages as image}
						<div
							class="relative group rounded overflow-hidden border {selectedImageUrl === image.url
								? 'ring-4 ring-blue-500'
								: ''}"
						>
							<button
								type="button"
								on:click={() => {
									selectedImageUrl = image.url;
									showImagePreview = true;
								}}
								class="w-full"
							>
								<img
									src={image.url}
									alt={image.name}
									class="w-full h-32 object-cover"
									loading="lazy"
								/>
								<div
									class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity"
								>
									<p class="truncate">{image.name}</p>
									<p>{new Date(image.timeCreated).toLocaleDateString()}</p>
								</div>
							</button>
							<div class="p-2 bg-gray-50">
								<button
									type="button"
									on:click={() => {
										createStoryImageUrl = image.url;
										showCreateStoryModal = true;
									}}
									class="btn btn-sm btn-secondary w-full">Create Story</button
								>
							</div>
						</div>
					{:else}
						<p class="text-gray-500 text-sm p-4 col-span-2">No images found in storage.</p>
					{/each}
				</div>
			</div>
		</div>

		<!-- Assignment Form -->
		<form
			method="POST"
			action="?/assignImageToStory"
			class="mt-6 flex gap-4 items-center"
			use:enhance
		>
			<input type="hidden" name="storyId" value={selectedStoryId} />
			<input type="hidden" name="imageUrl" value={selectedImageUrl} />

			<div class="flex-1">
				{#if selectedStoryId && selectedImageUrl}
					<p class="text-sm text-gray-700">
						Ready to assign image to <span class="font-semibold">Story #{selectedStoryId}</span>
					</p>
				{:else}
					<p class="text-sm text-gray-500">
						Select a story and an image to assign them together
					</p>
				{/if}
			</div>

			<button
				type="submit"
				disabled={!selectedStoryId || !selectedImageUrl}
				class="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Assign Image
			</button>
		</form>

		<!-- Image Preview Modal -->
		{#if showImagePreview && selectedImageUrl}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
				on:click={() => (showImagePreview = false)}
			>
				<div
					class="bg-white p-4 rounded-lg max-w-2xl max-h-[90vh] overflow-auto"
					on:click|stopPropagation
					role="dialog"
					aria-modal="true"
					tabindex="-1"
				>
					<div class="flex justify-between items-center mb-4">
						<h3 class="font-semibold">Image Preview</h3>
						<button
							type="button"
							on:click={() => (showImagePreview = false)}
							class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button
						>
					</div>
					<img src={selectedImageUrl} alt="Preview" class="w-full h-auto" />
				</div>
			</div>
		{/if}

		<!-- Create Story from Image Modal -->
		{#if showCreateStoryModal && createStoryImageUrl}
			<div
				class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
				on:click={() => (showCreateStoryModal = false)}
			>
				<div
					class="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full"
					on:click|stopPropagation
				>
					<h3 class="text-xl font-semibold mb-4">Create Story from Image</h3>
					<img src={createStoryImageUrl} alt="Selected" class="w-full h-48 object-cover rounded mb-4" />

					<form method="POST" action="?/createStoryFromImage" use:enhance>
						<input type="hidden" name="imageUrl" value={createStoryImageUrl} />
						<textarea
							name="prompt"
							class="textarea w-full"
							rows="3"
							placeholder="e.g., A story about a brave knight and this castle..."
							required
						></textarea>
						<div class="flex justify-end gap-4 mt-4">
							<button
								type="button"
								on:click={() => (showCreateStoryModal = false)}
								class="btn btn-ghost">Cancel</button
							>
							<button type="submit" class="btn btn-primary">Generate Story</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	</div>
</div>
