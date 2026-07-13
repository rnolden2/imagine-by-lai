<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	type Tab = 'kids' | 'math' | 'spelling' | 'status';

	const grades = ['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8'];
	const storyThemes = ['space', 'animals', 'travel', 'food', 'fairy-tales', 'superheroes'];
	const mathOperations = [
		'addition',
		'subtraction',
		'multiplication',
		'division',
		'fractions',
		'time',
		'number-recognition'
	];

	let activeTab: Tab = 'kids';
	let selectedStoryId = '';
	let selectedImageUrl = '';
	let selectedImageObjectName = '';
	let showImagePreview = false;
	let showCreateStoryModal = false;
	let createStoryImageUrl: string | null = null;
	let createStoryImageObjectName = '';
	let regeneratingStoryId: number | null = null;

	function normalizeOps(value: unknown): string[] {
		if (Array.isArray(value)) return value;
		if (typeof value === 'string') return value.split(',').filter(Boolean);
		return [];
	}

	function currentOps(userId: number, grade: string) {
		const saved = data.mathSettings.find(
			(setting) => (setting.child_id ?? setting.user_id) === userId
		);
		if (saved) return normalizeOps(saved.operations);
		if (grade === 'TK' || grade === 'K') return ['number-recognition', 'addition'];
		if (grade === '1') return ['addition', 'subtraction', 'time'];
		return ['addition', 'subtraction', 'multiplication', 'fractions', 'time'];
	}

	function currentMax(userId: number, grade: string) {
		const saved = data.mathSettings.find(
			(setting) => (setting.child_id ?? setting.user_id) === userId
		);
		const config = saved?.config ?? {};
		if (config.maxNumber) return Number(config.maxNumber);
		if (grade === 'TK' || grade === 'K' || grade === '1') return 10;
		return 100;
	}

	function pct(correct: number, total: number) {
		return total === 0 ? 0 : Math.round((correct / total) * 100);
	}

	$: storyCount = data.stories.length;
	$: mathAttemptCount = data.mathStats.reduce((sum, row) => sum + Number(row.total), 0);
	$: spellingAttemptCount = data.spellingStats.reduce((sum, row) => sum + Number(row.total), 0);
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-7xl">
		<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="text-3xl font-black text-slate-900">Admin Dashboard</h1>
				<p class="text-sm font-semibold text-slate-500">
					Profiles, practice settings, lists, and health.
				</p>
			</div>
			<div class="grid grid-cols-3 gap-2 text-center">
				<div class="rounded-lg bg-white px-4 py-3 shadow">
					<p class="text-primary text-2xl font-black">{storyCount}</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Stories</p>
				</div>
				<div class="rounded-lg bg-white px-4 py-3 shadow">
					<p class="text-2xl font-black text-emerald-500">{mathAttemptCount}</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Math</p>
				</div>
				<div class="rounded-lg bg-white px-4 py-3 shadow">
					<p class="text-2xl font-black text-amber-500">{spellingAttemptCount}</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Spelling</p>
				</div>
			</div>
		</div>

		{#if form?.message}
			<div
				class="mb-4 rounded-lg border bg-white px-4 py-3 text-sm font-semibold {form.success
					? 'border-emerald-200 text-emerald-700'
					: 'border-rose-200 text-rose-700'}"
			>
				{form.message}
			</div>
		{/if}

		<div class="mb-6 flex flex-wrap gap-2 rounded-xl bg-white p-2 shadow">
			{#each [['kids', 'Kids Profiles'], ['math', 'Math Operations'], ['spelling', 'Spelling Lists'], ['status', 'System Status']] as tab}
				<button
					type="button"
					on:click={() => (activeTab = tab[0] as Tab)}
					class="rounded-lg px-4 py-3 text-sm font-black transition {activeTab === tab[0]
						? 'bg-primary text-slate-900 shadow'
						: 'text-slate-600 hover:bg-slate-100'}"
				>
					{tab[1]}
				</button>
			{/each}
		</div>

		{#if activeTab === 'kids'}
			<section class="grid gap-6 lg:grid-cols-[380px_1fr]">
				<div class="rounded-xl bg-white p-5 shadow">
					<h2 class="mb-4 text-xl font-black text-slate-800">Add Child</h2>
					<form method="POST" action="?/addUser" use:enhance class="space-y-4">
						<input
							name="name"
							class="w-full rounded-lg border-slate-300"
							placeholder="Child name"
							required
						/>
						<div class="grid grid-cols-2 gap-3">
							<select name="grade" class="rounded-lg border-slate-300" required>
								<option disabled selected>Grade</option>
								{#each grades as grade}<option value={grade}>{grade}</option>{/each}
							</select>
							<select name="gender" class="rounded-lg border-slate-300" required>
								<option disabled selected>Gender</option>
								<option value="boy">Boy</option>
								<option value="girl">Girl</option>
							</select>
						</div>
						<textarea
							name="characterDescription"
							rows="3"
							class="w-full rounded-lg border-slate-300"
							placeholder="Character look, like curly brown hair, red glasses, blue cap"
						></textarea>
						<div>
							<p class="mb-2 text-sm font-black text-slate-600">Story Themes</p>
							<div class="flex flex-wrap gap-2">
								{#each storyThemes as storyTheme}
									<label class="rounded-full border border-slate-200 px-3 py-2 text-sm font-bold">
										<input
											type="checkbox"
											name="storyThemes"
											value={storyTheme}
											class="mr-1"
											checked={storyTheme === 'space'}
										/>
										{storyTheme}
									</label>
								{/each}
							</div>
						</div>
						<label class="block text-sm font-black text-slate-600">
							Story length
							<select name="storyLengthMinutes" class="mt-1 w-full rounded-lg border-slate-300">
								<option value="3">3 minutes</option>
								<option value="5" selected>5 minutes</option>
								<option value="8">8 minutes</option>
								<option value="10">10 minutes</option>
							</select>
						</label>
						<button
							type="submit"
							class="bg-primary w-full rounded-lg px-4 py-3 font-black text-slate-900 shadow"
							>Add Child</button
						>
					</form>
				</div>

				<div class="space-y-4">
					{#each data.users as user}
						<form
							method="POST"
							action="?/saveChildSettings"
							use:enhance
							class="rounded-xl bg-white p-5 shadow"
						>
							<input type="hidden" name="id" value={user.id} />
							<div class="grid gap-4 lg:grid-cols-[1fr_160px_160px]">
								<input
									name="name"
									value={user.name}
									class="rounded-lg border-slate-300 text-lg font-black"
									required
								/>
								<select name="grade" class="rounded-lg border-slate-300">
									{#each grades as grade}<option value={grade} selected={user.grade === grade}
											>{grade}</option
										>{/each}
								</select>
								<select name="gender" class="rounded-lg border-slate-300">
									<option value="boy" selected={user.gender === 'boy'}>Boy</option>
									<option value="girl" selected={user.gender === 'girl'}>Girl</option>
								</select>
							</div>
							<textarea
								name="characterDescription"
								rows="2"
								class="mt-4 w-full rounded-lg border-slate-300"
								placeholder="Suggest how the character should look"
								>{user.character_description ?? ''}</textarea
							>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each storyThemes as storyTheme}
									<label class="rounded-full border border-slate-200 px-3 py-2 text-sm font-bold">
										<input
											type="checkbox"
											name="storyThemes"
											value={storyTheme}
											class="mr-1"
											checked={(user.story_themes ?? []).includes(storyTheme)}
										/>
										{storyTheme}
									</label>
								{/each}
							</div>
							<div class="mt-4 flex flex-wrap items-center gap-3">
								<select name="storyLengthMinutes" class="rounded-lg border-slate-300">
									{#each [3, 5, 8, 10] as minutes}
										<option value={minutes} selected={(user.story_length_minutes ?? 5) === minutes}
											>{minutes} minutes</option
										>
									{/each}
								</select>
								<button
									type="submit"
									class="rounded-lg bg-slate-900 px-4 py-2 font-black text-white">Save</button
								>
								<button
									type="submit"
									formaction="?/deleteUser"
									class="rounded-lg px-3 py-2 font-bold text-rose-600"
								>
									Delete
								</button>
							</div>
						</form>
					{:else}
						<p class="rounded-xl bg-white p-6 text-slate-500 shadow">No child profiles yet.</p>
					{/each}

					<div class="rounded-xl bg-white p-5 shadow">
						<h2 class="mb-4 text-xl font-black text-slate-800">Life Lessons</h2>
						<form method="POST" action="?/addLesson" use:enhance class="mb-4 flex gap-2">
							<input
								name="lesson"
								class="min-w-0 flex-1 rounded-lg border-slate-300"
								placeholder="New positive life lesson"
								required
							/>
							<button class="bg-primary rounded-lg px-4 py-2 font-black text-slate-900">Add</button>
						</form>
						<div class="flex flex-wrap gap-2">
							{#each data.lessons as lesson}
								<div
									class="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-bold"
								>
									<span>{lesson.lesson}</span>
									<form method="POST" action="?/deleteLesson" use:enhance>
										<input type="hidden" name="id" value={lesson.id} />
										<button class="text-rose-500" aria-label="Delete lesson">x</button>
									</form>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</section>
		{:else if activeTab === 'math'}
			<section class="space-y-6">
				<div class="grid gap-4 md:grid-cols-2">
					{#each data.users as user}
						{@const ops = currentOps(user.id, user.grade)}
						{@const max = currentMax(user.id, user.grade)}
						<form
							method="POST"
							action="?/saveMathSettings"
							use:enhance
							class="rounded-xl bg-white p-5 shadow"
						>
							<input type="hidden" name="userId" value={user.id} />
							<h2 class="mb-4 text-xl font-black text-slate-800">{user.name}</h2>
							<div class="mb-4 flex flex-wrap gap-2">
								{#each mathOperations as op}
									<label class="rounded-full border border-slate-200 px-3 py-2 text-sm font-bold">
										<input
											type="checkbox"
											name="operations"
											value={op}
											checked={ops.includes(op)}
											class="mr-1"
										/>
										{op}
									</label>
								{/each}
							</div>
							<select name="maxNumber" class="mb-4 w-full rounded-lg border-slate-300">
								{#each [10, 20, 100, 1000] as range}
									<option value={range} selected={max === range}>1 to {range}</option>
								{/each}
							</select>
							<div class="flex items-center gap-3">
								<button class="bg-primary rounded-lg px-4 py-2 font-black text-slate-900"
									>Save Math</button
								>
								<button
									type="submit"
									formaction="?/clearMathStats"
									class="text-sm font-bold text-rose-600"
								>
									Clear stats
								</button>
							</div>
						</form>
					{/each}
				</div>
				<div class="rounded-xl bg-white p-5 shadow">
					<h2 class="mb-4 text-xl font-black text-slate-800">Math History</h2>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead
								><tr class="text-left text-slate-500"
									><th class="py-2">Date</th><th>Child</th><th>Correct</th><th>Total</th><th
										>Score</th
									></tr
								></thead
							>
							<tbody>
								{#each data.mathStats as row}
									<tr class="border-t">
										<td class="py-2">{new Date(row.started_at).toLocaleString()}</td>
										<td>{row.child_name ?? row.user_name ?? 'Unknown'}</td>
										<td>{row.correct}</td>
										<td>{row.total}</td>
										<td>{pct(row.correct, row.total)}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</section>
		{:else if activeTab === 'spelling'}
			<section class="space-y-6">
				<div class="rounded-xl bg-white p-5 shadow">
					<h2 class="mb-4 text-xl font-black text-slate-800">Custom Words</h2>
					<form
						method="POST"
						action="?/addSpellingWord"
						use:enhance
						class="mb-5 flex flex-wrap gap-3"
					>
						<input name="word" class="rounded-lg border-slate-300" placeholder="Word" required />
						<select name="grade" class="rounded-lg border-slate-300" required>
							<option disabled selected>Grade</option>
							{#each grades.slice(0, 6) as grade}<option value={grade}>{grade}</option>{/each}
						</select>
						<button class="bg-primary rounded-lg px-4 py-2 font-black text-slate-900"
							>Add Word</button
						>
					</form>
					<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each grades.slice(0, 6) as grade}
							{@const words = data.spellingWords.filter((word) => word.grade === grade)}
							<div class="rounded-lg border border-slate-200 p-4">
								<h3 class="mb-3 font-black text-slate-700">Grade {grade}</h3>
								<div class="flex flex-wrap gap-2">
									{#each words as word}
										<div
											class="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-bold"
										>
											<span>{word.word}</span>
											<form method="POST" action="?/deleteSpellingWord" use:enhance>
												<input type="hidden" name="id" value={word.id} />
												<button class="text-rose-500">x</button>
											</form>
										</div>
									{:else}
										<p class="text-sm text-slate-400">Using built-in list.</p>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="rounded-xl bg-white p-5 shadow">
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-xl font-black text-slate-800">Spelling History</h2>
						<form method="POST" action="?/clearSpellingStats" use:enhance>
							<button class="text-sm font-bold text-rose-600">Clear all</button>
						</form>
					</div>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead
								><tr class="text-left text-slate-500"
									><th class="py-2">Date</th><th>Child</th><th>Grade</th><th>Correct</th><th
										>Total</th
									><th>Score</th></tr
								></thead
							>
							<tbody>
								{#each data.spellingStats as row}
									<tr class="border-t">
										<td class="py-2">{new Date(row.started_at).toLocaleString()}</td>
										<td>{row.child_name ?? row.user_name ?? 'Unknown'}</td>
										<td>{row.grade}</td>
										<td>{row.correct}</td>
										<td>{row.total}</td>
										<td>{pct(row.correct, row.total)}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</section>
		{:else}
			<section class="space-y-6">
				<div class="grid gap-4 md:grid-cols-4">
					<div class="rounded-xl bg-white p-5 shadow">
						<p class="text-sm font-bold text-slate-500">Connection</p>
						<p class="text-xl font-black">Supabase</p>
						<p class="text-xs text-slate-400">Postgres transaction pooler</p>
					</div>
					<div class="rounded-xl bg-white p-5 shadow">
						<p class="text-sm font-bold text-slate-500">Children</p>
						<p class="text-xl font-black">{data.users.length}</p>
					</div>
					<div class="rounded-xl bg-white p-5 shadow">
						<p class="text-sm font-bold text-slate-500">Custom Words</p>
						<p class="text-xl font-black">{data.spellingWords.length}</p>
					</div>
					<div class="rounded-xl bg-white p-5 shadow">
						<p class="text-sm font-bold text-slate-500">Image Queue</p>
						<p class="text-xl font-black">{data.availableImages.length}</p>
					</div>
				</div>
				{#if data.gcsError}
					<div
						class="rounded-xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-800"
					>
						{data.gcsError}
					</div>
				{/if}
				<div class="rounded-xl bg-white p-5 shadow">
					<h2 class="mb-4 text-xl font-black text-slate-800">Story Image Assignment</h2>
					<div class="grid gap-6 lg:grid-cols-2">
						<div class="space-y-2">
							{#each data.storiesWithoutImages as story}
								<button
									type="button"
									on:click={() => (selectedStoryId = String(story.id))}
									class="w-full rounded-lg border p-3 text-left {selectedStoryId ===
									String(story.id)
										? 'border-primary bg-primary/10'
										: 'border-slate-200'}"
								>
									<p class="font-black">Story #{story.id}</p>
									<p class="truncate text-sm text-slate-500">{story.prompt}</p>
								</button>
							{:else}
								<p class="text-sm text-slate-400">All stories have images.</p>
							{/each}
						</div>
						<div class="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto">
							{#each data.availableImages as image}
								<button
									type="button"
									on:click={() => {
										selectedImageUrl = image.url;
										selectedImageObjectName = image.objectName;
										showImagePreview = true;
									}}
									class="overflow-hidden rounded-lg border {selectedImageUrl === image.url
										? 'border-primary ring-primary/30 ring-4'
										: 'border-slate-200'}"
								>
									<img
										src={image.url}
										alt={image.name}
										class="h-32 w-full object-cover"
										loading="lazy"
									/>
								</button>
							{/each}
						</div>
					</div>
					<form
						method="POST"
						action="?/assignImageToStory"
						use:enhance
						class="mt-4 flex flex-wrap items-center gap-3"
					>
						<input type="hidden" name="storyId" value={selectedStoryId} />
						<input type="hidden" name="imageUrl" value={selectedImageUrl} />
						<input type="hidden" name="imageObjectName" value={selectedImageObjectName} />
						<button
							disabled={!selectedStoryId || !selectedImageUrl}
							class="bg-primary rounded-lg px-4 py-2 font-black text-slate-900 disabled:opacity-40"
							>Assign Image</button
						>
						<button
							type="button"
							disabled={!selectedImageUrl}
							on:click={() => {
								createStoryImageUrl = selectedImageUrl;
								createStoryImageObjectName = selectedImageObjectName;
								showCreateStoryModal = true;
							}}
							class="rounded-lg bg-slate-900 px-4 py-2 font-black text-white disabled:opacity-40"
							>Create Story</button
						>
					</form>
				</div>
				<div class="rounded-xl bg-white p-5 shadow">
					<h2 class="mb-4 text-xl font-black text-slate-800">Regenerate Story Images</h2>
					<div class="grid gap-3 md:grid-cols-2">
						{#each data.stories as story}
							<div class="flex gap-3 rounded-lg border border-slate-200 p-3">
								<img
									src={story.image_url}
									alt="Story illustration"
									class="h-20 w-24 rounded-lg object-cover"
									loading="lazy"
								/>
								<div class="min-w-0 flex-1">
									<p class="font-black text-slate-800">Story #{story.id}</p>
									<p class="truncate text-sm text-slate-500">{story.prompt}</p>
									<form
										method="POST"
										action="?/regenerateStoryImage"
										use:enhance={() => {
											regeneratingStoryId = story.id;
											return async ({ update }) => {
												await update();
												regeneratingStoryId = null;
											};
										}}
										class="mt-3"
									>
										<input type="hidden" name="storyId" value={story.id} />
										<button
											class="bg-primary rounded-lg px-3 py-2 text-sm font-black text-slate-900 disabled:opacity-50"
											disabled={regeneratingStoryId !== null}
										>
											{regeneratingStoryId === story.id ? 'Regenerating...' : 'Regenerate image'}
										</button>
									</form>
									<form method="POST" action="?/deleteStory" use:enhance class="mt-2">
										<input type="hidden" name="id" value={story.id} />
										<button
											type="submit"
											on:click={(event) => {
												if (
													!confirm(
														`Delete story #${story.id}? This will remove the story and its image permanently.`
													)
												) {
													event.preventDefault();
												}
											}}
											class="rounded-lg border border-rose-200 px-3 py-2 text-sm font-black text-rose-600 hover:bg-rose-50"
										>
											Delete story and image
										</button>
									</form>
								</div>
							</div>
						{:else}
							<p class="text-sm text-slate-400">No stories yet.</p>
						{/each}
					</div>
				</div>
			</section>
		{/if}
	</div>
</div>

{#if showImagePreview && selectedImageUrl}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
		on:click={() => (showImagePreview = false)}
		role="presentation"
	>
		<div
			class="max-h-[90vh] max-w-3xl overflow-auto rounded-xl bg-white p-4"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<img src={selectedImageUrl} alt="Preview" class="h-auto w-full rounded-lg" />
		</div>
	</div>
{/if}

{#if showCreateStoryModal && createStoryImageUrl}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
		on:click={() => (showCreateStoryModal = false)}
		role="presentation"
	>
		<div
			class="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h2 class="mb-4 text-xl font-black text-slate-800">Create Story from Image</h2>
			<img
				src={createStoryImageUrl}
				alt="Selected"
				class="mb-4 h-48 w-full rounded-lg object-cover"
			/>
			<form method="POST" action="?/createStoryFromImage" use:enhance class="space-y-3">
				<input type="hidden" name="imageUrl" value={createStoryImageUrl} />
				<input type="hidden" name="imageObjectName" value={createStoryImageObjectName} />
				<textarea
					name="prompt"
					rows="3"
					class="w-full rounded-lg border-slate-300"
					placeholder="Story idea"
					required
				></textarea>
				<div class="flex justify-end gap-3">
					<button
						type="button"
						on:click={() => (showCreateStoryModal = false)}
						class="rounded-lg px-4 py-2 font-bold">Cancel</button
					>
					<button class="bg-primary rounded-lg px-4 py-2 font-black text-slate-900">Generate</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}
