<script lang="ts">
	import { savePracticeAttempt } from '#lib/practice-history';
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import type { Settings } from '#lib/math';
	import { resolveMathSettings } from '#lib/math';
	import { watchMathSettings } from '#lib/math-settings-sync';
	import { generateSpaceProblem, PLANETS, problemHint } from '#lib/games/space-math/engine';
	import ProblemVisual from '#lib/games/space-math/ProblemVisual.svelte';
	import SpaceScene from '#lib/games/space-math/SpaceScene.svelte';

	export let data: PageData;
	let selectedUser: PageData['users'][number] | null = null;
	let currentSettings: Settings | null = null;
	let problem: ReturnType<typeof generateSpaceProblem> | null = null;
	let sessionId = '';
	let visited = 0;
	let feedback: 'correct' | 'retry' | null = null;
	let showHint = false;
	let settingsError = false;
	let historyError = false;
	let continueButton: HTMLButtonElement;
	let questionHeading: HTMLHeadingElement;

	onMount(() =>
		watchMathSettings(
			(mathSettings) => (data = { ...data, mathSettings }),
			(failed) => (settingsError = failed)
		)
	);

	function settingsFor(user: NonNullable<typeof selectedUser>) {
		return resolveMathSettings(
			user.grade,
			data.mathSettings.find((row) => Number(row.child_id ?? row.user_id) === Number(user.id))
		);
	}

	function selectUser(user: NonNullable<typeof selectedUser>) {
		if (selectedUser?.id === user.id) return;
		selectedUser = user;
		currentSettings = settingsFor(user);
		sessionId = crypto.randomUUID();
		visited = 0;
		historyError = false;
		nextProblem();
	}

	function applySettings(_settings: PageData['mathSettings'], user: typeof selectedUser) {
		if (!user) return;
		const next = settingsFor(user);
		if (JSON.stringify(next) === JSON.stringify(currentSettings)) return;
		currentSettings = next;
		// Keep a landing celebration visible; the next question uses the new settings.
		if (feedback !== 'correct') nextProblem();
	}
	$: applySettings(data.mathSettings, selectedUser);
	$: destination =
		PLANETS[(feedback === 'correct' ? Math.max(0, visited - 1) : visited) % PLANETS.length];

	function nextProblem() {
		if (!currentSettings) return;
		problem = generateSpaceProblem(currentSettings);
		feedback = null;
		showHint = false;
		void tick().then(() => questionHeading?.focus({ preventScroll: true }));
	}

	function chooseAnswer(answer: string) {
		if (!problem || !selectedUser || feedback === 'correct') return;
		const correct = answer === problem.answer;
		feedback = correct ? 'correct' : 'retry';
		if (correct) {
			visited += 1;
			void tick().then(() => continueButton?.focus({ preventScroll: true }));
		}
		const attemptSession = sessionId;
		void savePracticeAttempt('math', {
			childId: selectedUser.id,
			sessionId,
			operation: problem.op,
			problemState: problem.state,
			givenAnswer: answer
		}).catch(() => {
			if (sessionId === attemptSession) historyError = true;
		});
	}
</script>

<svelte:head><title>Space Math · Imaginations By Lai</title></svelte:head>

<div class="space-page min-h-screen px-4 py-7 text-indigo-50 sm:py-10">
	<section class="mx-auto max-w-3xl">
		<a
			href={resolve('/games')}
			class="text-sm font-bold text-indigo-200 underline-offset-4 hover:underline">← All games</a
		>
		<header class="mt-6 text-center">
			<p class="text-xs font-extrabold tracking-[0.25em] text-cyan-200 uppercase">
				Little steps. Big universe.
			</p>
			<h1 class="mt-2 text-4xl font-extrabold sm:text-5xl">Space Math</h1>
			<p class="mt-3 text-indigo-200">A little math fuels a whole new adventure.</p>
		</header>
		{#if data.users.length}
			<div
				class="mt-7 flex flex-wrap justify-center gap-3"
				role="group"
				aria-label="Choose your explorer"
			>
				{#each data.users as user (user.id)}
					<button
						type="button"
						on:click={() => selectUser(user)}
						aria-pressed={selectedUser?.id === user.id}
						class="explorer rounded-full border border-indigo-400/50 px-5 py-3 font-extrabold transition hover:bg-indigo-800"
						>{user.name}</button
					>
				{/each}
			</div>
		{:else}
			<div class="mt-8 rounded-3xl bg-indigo-900/70 p-7 text-center">
				<h2 class="text-xl font-extrabold">Your spaceship is waiting.</h2>
				<p class="mt-3">
					Ask a grown-up to add your profile in <a
						class="font-bold underline"
						href={resolve('/settings')}>Settings</a
					>, then come back to explore.
				</p>
			</div>
		{/if}
		{#if settingsError}<p role="status" class="mt-4 text-center text-sm text-amber-200">
				Settings could not be refreshed. You can keep exploring; we’ll retry automatically.
			</p>{/if}
		{#if historyError}<p role="status" class="mt-4 text-center text-sm text-amber-200">
				Some answers could not be saved to math history. You can keep exploring.
			</p>{/if}

		<SpaceScene {visited} landed={feedback === 'correct'} />

		{#if selectedUser && problem}
			<div
				class="mb-4 flex flex-wrap items-center justify-between gap-2 px-2 text-sm font-bold text-indigo-200"
			>
				<p>
					{feedback === 'correct' ? 'Landed on' : 'Next stop:'}
					<span class="text-white">{destination.name}</span>
				</p>
				<p data-testid="planet-count">{visited} {visited === 1 ? 'planet' : 'planets'} visited</p>
			</div>
			<section
				aria-label="Math challenge"
				class="rounded-3xl border border-indigo-400/30 bg-indigo-950/80 p-5 shadow-xl sm:p-8"
			>
				<div class="mb-6 flex items-center gap-3 text-sm font-bold text-indigo-200">
					<span>{feedback === 'correct' ? 'Fuel ready!' : 'Fuel your ship'}</span>
					<div
						role="meter"
						aria-label="Ship fuel"
						aria-valuemin="0"
						aria-valuemax="1"
						aria-valuenow={feedback === 'correct' ? 1 : 0}
						class="h-3 flex-1 overflow-hidden rounded-full bg-indigo-900"
					>
						<div
							class="fuel h-full rounded-full bg-cyan-200"
							style:width={feedback === 'correct' ? '100%' : '0%'}
						></div>
					</div>
				</div>
				<h2
					bind:this={questionHeading}
					tabindex="-1"
					class="mb-6 text-center text-lg font-bold outline-none"
				>
					{problem.prompt}
				</h2>
				<ProblemVisual {problem} {showHint} />
				<div class="mt-7 grid grid-cols-3 gap-2 sm:gap-4" role="group" aria-label="Answer choices">
					{#each problem.choices as choice (choice)}
						<button
							type="button"
							on:click={() => chooseAnswer(choice)}
							disabled={feedback === 'correct'}
							class="answer min-h-16 rounded-2xl border-2 border-indigo-300/50 bg-indigo-900 px-2 py-4 text-xl font-extrabold text-white transition hover:border-cyan-200 hover:bg-indigo-800 disabled:cursor-default sm:text-3xl"
							class:correct={feedback === 'correct' && choice === problem.answer}>{choice}</button
						>
					{/each}
				</div>
				<div
					role="status"
					aria-live="polite"
					aria-atomic="true"
					class="mt-5 min-h-8 text-center font-bold"
				>
					{#if feedback === 'correct'}<p class="text-cyan-200">
							You did it! Welcome to {destination.name}.
						</p>
					{:else if feedback === 'retry'}<p class="text-amber-200">
							Not quite yet. Try again, or explore a hint.
						</p>
					{:else}<p class="text-sm font-normal text-indigo-200">
							Take your time. Your spaceship will wait.
						</p>{/if}
				</div>
				{#if feedback === 'correct'}
					<p class="mt-2 text-center text-indigo-200">{destination.detail}</p>
					<button
						bind:this={continueButton}
						type="button"
						on:click={nextProblem}
						class="mt-6 w-full rounded-2xl bg-cyan-200 px-5 py-4 text-lg font-extrabold text-indigo-950 hover:bg-cyan-100"
						>Keep exploring →</button
					>
				{:else}
					<div class="mt-3 text-center">
						<button
							type="button"
							aria-expanded={showHint}
							aria-controls="space-hint"
							on:click={() => (showHint = !showHint)}
							class="rounded-xl px-5 py-3 font-bold text-cyan-200 underline decoration-cyan-200/40 underline-offset-4"
							>{showHint ? 'Hide hint' : 'Show hint'}</button
						>
					</div>
				{/if}
				{#if showHint}<p
						id="space-hint"
						class="mt-3 rounded-2xl border border-indigo-400/30 bg-indigo-900/80 p-4 text-center leading-relaxed text-indigo-100"
					>
						{problemHint(problem)}
					</p>{/if}
			</section>
		{:else if data.users.length}
			<div class="text-center">
				<h2 class="text-2xl font-extrabold">Who’s ready to explore?</h2>
				<p class="mt-3 text-indigo-200">Choose your name to start your journey.</p>
			</div>
		{/if}
		<p class="mt-7 text-center text-xs text-indigo-200/80">
			Explore at your own pace. Every little discovery counts.
		</p>
	</section>
</div>

<style>
	.space-page {
		background: radial-gradient(ellipse at 20% 0%, #312e81 0%, #151534 50%, #0c1025 100%);
	}
	.explorer[aria-pressed='true'] {
		background: #cffafe;
		color: #1e1b4b;
		border-color: #cffafe;
	}
	.answer.correct {
		background: #cffafe;
		border-color: #67e8f9;
		color: #1e1b4b;
	}
	.fuel {
		transition: width 600ms ease;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 3px solid #fde68a;
		outline-offset: 4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.fuel,
		button {
			transition: none;
		}
	}
</style>
