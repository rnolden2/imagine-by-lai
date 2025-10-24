<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<h1 class="text-3xl font-bold text-gray-900 mb-6">Admin Settings</h1>

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
</div>
