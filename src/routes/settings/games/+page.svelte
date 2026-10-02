<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let selected = $state(0);
	let favorite = $state('');
	let message = $state('');
	let busy = $state(false);
	let confirmation = $state('');
	const child = $derived(data.profiles.find((c) => Number(c.id) === selected) ?? data.profiles[0]);
	async function act(body: Record<string, unknown>) {
		if (busy) return;
		busy = true;
		message = '';
		try {
			const r = await fetch('/api/settings/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const b = await r.json();
			if (!r.ok) throw new Error(b.message ?? 'Could not save.');
			await invalidateAll();
			message = 'Saved.';
			if (body.action === 'favorite') favorite = '';
			if (body.action === 'generate') await goto(`/settings/games/word-kitchen/jobs/${b.id}`);
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connection interrupted.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Parent kitchen · Game settings</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-10">
	<a href="/settings" class="font-bold text-teal-800">← Settings</a>
	<h1 class="my-6 text-4xl font-extrabold text-teal-950">The parent kitchen</h1>
	<p class="mb-6 text-slate-600">
		Choose the practice, set food preferences, and make room for imagination.
	</p>
	<nav class="mb-8 flex flex-wrap gap-5 font-bold text-teal-800">
		<a href="/games/word-kitchen">Play Word Kitchen</a><a
			href="/settings/games/word-kitchen/recipes">Recipe reviews & generation</a
		>
	</nav>
	<p role="status" class="my-4">{message}</p>
	{#if child}<label class="font-bold"
			>Child <select bind:value={selected} class="ml-3 rounded-xl"
				><option value={0}>Choose a child</option>{#each data.profiles as profile}<option
						value={Number(profile.id)}>{profile.name}</option
					>{/each}</select
			></label
		>
		<div class="mt-8 grid gap-8 md:grid-cols-2">
			<section class="rounded-3xl bg-white p-6 shadow-sm">
				<h2 class="mb-4 text-2xl font-bold">Practice preferences</h2>
				<p class="mb-5 text-sm">{child.notice}</p>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						const f = new FormData(e.currentTarget);
						void act({
							action: 'settings',
							childId: Number(child.id),
							settings: {
								...child.settings,
								difficulty: f.get('difficulty'),
								targetMinutes: Number(f.get('duration')),
								excludedFoodConceptIds: f.getAll('exclude')
							}
						});
					}}
				>
					<label class="mb-4 block"
						>Support level <select
							name="difficulty"
							value={child.settings.difficulty}
							class="ml-2 rounded-lg"
							><option value="supported">Extra support</option><option value="standard"
								>Standard</option
							><option value="challenge">Challenge</option></select
						></label
					><label class="mb-5 block"
						>Default play time <select
							name="duration"
							value={child.settings.targetMinutes}
							class="ml-2 rounded-lg"
							><option value="5">5 minutes</option><option value="8">8 minutes</option><option
								value="10">10 minutes</option
							></select
						></label
					>
					<fieldset>
						<legend class="font-bold">Exclude foods from play</legend>
						<p class="my-2 text-sm text-slate-600">
							Preferences apply to pretend games. They are not dietary advice.
						</p>
						<div class="grid grid-cols-2 gap-2">
							{#each data.exclusions as item}<label
									><input
										type="checkbox"
										name="exclude"
										value={item.id}
										checked={child.settings.excludedFoodConceptIds.includes(item.id)}
									/>
									{item.label}</label
								>{/each}{#each ['dairy', 'egg', 'wheat'] as tag}<label
									><input
										type="checkbox"
										name="exclude"
										value={tag}
										checked={child.settings.excludedFoodConceptIds.includes(tag)}
									/>
									All {tag}</label
								>{/each}
						</div>
					</fieldset>
					<p class="mt-4 text-sm">Changing preferences asks child devices to unlock again.</p>
					<button disabled={busy} class="mt-5 rounded-xl bg-teal-800 px-5 py-3 font-bold text-white"
						>Save preferences</button
					>
				</form>
			</section>
			<section class="rounded-3xl bg-white p-6 shadow-sm">
				<h2 class="text-2xl font-bold">Favorite foods</h2>
				<form
					class="my-4 flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						void act({ action: 'favorite', childId: Number(child.id), name: favorite });
					}}
				>
					<label class="sr-only" for="favorite">Favorite food</label><input
						id="favorite"
						bind:value={favorite}
						maxlength="120"
						required
						placeholder="A favorite dish"
						class="min-w-0 flex-1 rounded-xl"
					/><button disabled={busy} class="rounded-xl bg-amber-100 px-4 font-bold">Add</button>
				</form>
				<p class="text-sm text-slate-600">
					Adding a favorite is free. “Create game” starts paid AI generation, with a $2 reserved
					budget per job and a $5 daily installation limit. You review every new game before
					publishing.
				</p>
				{#each data.favorites.filter((f) => Number(f.child_id) === Number(child.id)) as food}<div
						class="mt-4 flex flex-wrap items-center gap-3 border-t pt-4"
					>
						<strong class="mr-auto">{food.display_name}</strong><button
							disabled={busy}
							onclick={() =>
								act({
									action: 'generate',
									childId: Number(child.id),
									favoriteId: food.id,
									key: crypto.randomUUID()
								})}
							class="rounded-xl bg-teal-800 px-4 py-2 font-bold text-white">Create game</button
						><button disabled={busy} onclick={() => act({ action: 'remove_favorite', id: food.id })}
							>Remove</button
						>
					</div>{/each}
			</section>
			<section class="rounded-3xl bg-white p-6 shadow-sm">
				<h2 class="text-2xl font-bold">Device access</h2>
				<p class="my-4">
					Unlock Word Kitchen for {child.name} on this device for seven days. Parent settings still require
					your password.
				</p>
				<button
					disabled={busy}
					class="rounded-xl bg-teal-800 px-5 py-3 font-bold text-white"
					onclick={() => act({ action: 'unlock', childIds: [Number(child.id)] })}
					>Unlock this device</button
				>{#each data.devices.filter((d) => d.child_ids.includes(Number(child.id))) as device}<div
						class="mt-4 flex items-center justify-between gap-4"
					>
						<span>Expires {new Date(device.expires_at).toLocaleDateString()}</span><button
							onclick={() => act({ action: 'revoke', deviceId: device.id })}
							disabled={busy}>Revoke access</button
						>
					</div>{/each}
			</section>
			<section class="rounded-3xl bg-white p-6 shadow-sm">
				<h2 class="text-2xl font-bold">Growing in the kitchen</h2>
				<p class="my-4 text-3xl font-bold">{child.points} Chef Points</p>
				<p class="mb-4 text-sm text-slate-600">
					Points celebrate participation. Recipe familiarity uses the latest three completed
					sessions, scored separately for spelling and meaning.
				</p>
				{#each child.words as word}<div class="flex justify-between border-t py-2">
						<span>{word.word} · {word.skill} · {word.source}</span><span
							>{word.correct}/{word.independent} independent · {word.assisted} assisted</span
						>
					</div>{:else}<p>
						Learning results will appear after a cooking session.
					</p>{/each}{#each child.progress as recipe}<div class="mt-4 rounded-xl bg-teal-50 p-3">
						<strong>{recipe.title} familiarity</strong>{#each recipe.skills as skill}<p>
								{skill.skill}: level {skill.level} · {skill.firstTryIndependent}/{skill.occurrences}
								first-try independent
							</p>{/each}
					</div>{/each}{#each child.sessions.slice(0, 10) as session}<details
						class="mt-4 border-t pt-3"
					>
						<summary
							>{session.title} · {new Date(session.date).toLocaleDateString()} · {Math.round(
								session.activeMs / 60000
							)} active minutes</summary
						>
						<p class="text-xs">Revision {session.revisionId}</p>
						{#each session.evidence as attempt}<p class="mt-1 text-sm">
								{attempt.word} · {attempt.skill} · {attempt.mechanic.replaceAll('_', ' ')} · {attempt.assistance}
								· {attempt.correct ? 'correct' : 'practicing'}
							</p>{/each}
					</details>{/each}<label class="mt-6 block text-sm"
					>Type CLEAR to remove {child.name}’s game history, points, and linked spelling attempts.<input
						bind:value={confirmation}
						class="mt-2 w-full rounded-xl"
					/></label
				><button
					class="mt-3 text-red-800"
					disabled={busy || confirmation !== 'CLEAR'}
					onclick={() => act({ action: 'clear_history', childId: Number(child.id), confirmation })}
					>Clear game history</button
				>
			</section>
		</div>{:else}<p>Create a child profile in Settings first.</p>{/if}
</section>
