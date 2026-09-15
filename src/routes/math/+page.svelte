<script lang="ts">
	import type { PageData } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { watchMathSettings } from '$lib/math-settings-sync';
	import { generateProblem, resolveMathSettings, type Settings, type Problem } from '$lib/math';
	import { fade, scale } from 'svelte/transition';
	import { theme } from '$lib/stores';
	import { speak } from '$lib/tts';
	import MilestoneAnimation from '$lib/components/MilestoneAnimation.svelte';

	export let data: PageData;

	let selectedUser: (typeof data.users)[0] | null = null;
	let currentSettings: Settings | null = null;
	let sessionId = '';
	let correctCount = 0;
	let totalCount = 0;
	let currentProblem: Problem | null = null;
	let userAnswer = '';
	let feedback: 'correct' | 'wrong' | null = null;
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl: HTMLInputElement;
	let showMilestone = false;
	let milestoneCount = 0;

	let focusTimer: ReturnType<typeof setTimeout> | null = null;
	let historyError = false;
	let settingsError = false;
	onMount(() =>
		watchMathSettings(
			(mathSettings) => (data = { ...data, mathSettings }),
			(failed) => (settingsError = failed)
		)
	);
	onDestroy(() => {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		if (focusTimer) clearTimeout(focusTimer);
	});

	function range(n: number) {
		return Array.from({ length: n }, (_, i) => i);
	}

	function resolveSettings(userId: number, grade: string): Settings {
		return resolveMathSettings(
			grade,
			data.mathSettings.find((setting) => (setting.child_id ?? setting.user_id) === userId)
		);
	}

	function selectUser(user: (typeof data.users)[0]) {
		selectedUser = user;
		$theme = user.gender === 'boy' ? 'theme-boy' : 'theme-girl';
		currentSettings = resolveSettings(user.id, user.grade);
		startSession();
	}

	function applySavedSettings(mathSettings: PageData['mathSettings'], user: typeof selectedUser) {
		if (!user) return;
		const next = resolveMathSettings(
			user.grade,
			mathSettings.find((setting) => (setting.child_id ?? setting.user_id) === user.id)
		);
		// Background refreshes must not interrupt an answer unless the settings changed.
		if (JSON.stringify(next) === JSON.stringify(currentSettings)) return;
		currentSettings = next;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		nextProblem();
	}

	$: applySavedSettings(data.mathSettings, selectedUser);

	function startSession() {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		sessionId = crypto.randomUUID();
		showMilestone = false;
		historyError = false;
		correctCount = 0;
		totalCount = 0;
		nextProblem();
	}

	function nextProblem() {
		if (!currentSettings) return;
		currentProblem = generateProblem(currentSettings);
		userAnswer = '';
		feedback = null;
		if (focusTimer) clearTimeout(focusTimer);
		focusTimer = setTimeout(() => inputEl?.focus(), 80);
	}

	function chooseAnswer(answer: string) {
		userAnswer = answer;
		submitAnswer();
	}

	async function submitAnswer() {
		if (!currentProblem || feedback !== null || userAnswer.trim() === '') return;

		const given = userAnswer.trim();
		const isCorrect = given === currentProblem.answer;
		totalCount += 1;

		if (isCorrect) {
			correctCount += 1;
			feedback = 'correct';
			if (correctCount % 10 === 0) {
				milestoneCount = correctCount;
				showMilestone = true;
			}
		} else {
			feedback = 'wrong';
		}

		if (selectedUser && sessionId) {
			const attemptSession = sessionId;
			fetch(`${base}/api/math`, {
				method: 'POST',
				keepalive: true,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					childId: selectedUser.id,
					userId: selectedUser.id,
					sessionId,
					operation: currentProblem.op,
					problemState: currentProblem.state,
					num1: currentProblem.num1 ?? 0,
					num2: currentProblem.num2 ?? 0,
					correctAnswer: currentProblem.answer,
					givenAnswer: given,
					isCorrect
				})
			})
				.then((response) => {
					if (!response.ok) throw new Error('History save failed');
				})
				.catch(() => {
					if (sessionId === attemptSession) historyError = true;
				});
		}

		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => nextProblem(), isCorrect ? 800 : 2200);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAnswer();
	}

	$: accuracy = totalCount === 0 ? 100 : Math.round((correctCount / totalCount) * 100);
	$: clockMinute = Number(currentProblem?.state.minute ?? 0);
	$: clockHour = Number(currentProblem?.state.hour ?? 12);
	$: minuteRotation = clockMinute * 6;
	$: hourRotation = (clockHour % 12) * 30 + clockMinute * 0.5;
	$: fractionNumerator = Number(currentProblem?.state.numerator ?? 0);
	$: fractionDenominator = Number(currentProblem?.state.denominator ?? 1);
	$: recognitionNumber = Number(currentProblem?.state.number ?? 0);
</script>

<div class="min-h-screen bg-sky-50 px-4 py-8">
	<section class="mx-auto max-w-5xl">
		{#if settingsError}<p role="status" class="mb-4 text-center text-amber-800">
				Settings could not be refreshed. You can keep practicing; we’ll retry automatically.
			</p>{/if}
		{#if historyError}<p role="status" class="mb-4 text-center text-rose-700">
				Some answers could not be saved to history. You can keep practicing.
			</p>{/if}
		{#if data.users && data.users.length > 0}
			<div class="mb-8 text-center">
				<h1 class="mb-4 text-2xl font-black text-slate-800">Math Practice</h1>
				<div class="flex flex-wrap justify-center gap-3">
					{#each data.users as user (user.id)}
						<button
							type="button"
							on:click={() => selectUser(user)}
							class="rounded-full bg-white px-5 py-3 text-lg font-extrabold text-slate-800 shadow transition hover:-translate-y-1 hover:shadow-lg"
							class:ring-4={selectedUser?.id === user.id}
							class:ring-primary={selectedUser?.id === user.id}
						>
							{user.name}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if selectedUser && currentProblem && currentSettings}
			<div
				in:fade={{ duration: 250 }}
				class="mx-auto mb-6 grid max-w-xl grid-cols-3 gap-3 rounded-2xl bg-white p-3 shadow"
			>
				<div class="text-center">
					<p class="text-3xl font-black text-emerald-500">{correctCount}</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Correct</p>
				</div>
				<div class="text-center">
					<p class="text-3xl font-black text-slate-400">{totalCount}</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Total</p>
				</div>
				<div class="text-center">
					<p class="text-primary text-3xl font-black">{accuracy}%</p>
					<p class="text-xs font-bold text-slate-500 uppercase">Accuracy</p>
				</div>
			</div>

			<div
				in:scale={{ duration: 220, start: 0.96 }}
				class="mx-auto flex max-w-xl flex-col items-center gap-6 rounded-3xl bg-white p-6 shadow-xl"
			>
				<p class="text-center text-xl font-extrabold text-slate-700">{currentProblem.prompt}</p>

				{#if currentProblem.op === 'fractions'}
					<div class="grid h-52 w-52 place-items-center rounded-full bg-slate-100">
						<div
							class="h-44 w-44 rounded-full border-8 border-slate-700"
							style={`background: conic-gradient(rgb(var(--color-primary)) 0 ${fractionNumerator / fractionDenominator}turn, white 0 1turn); background-image: repeating-conic-gradient(transparent 0 calc(1turn / ${fractionDenominator} - 2deg), #334155 calc(1turn / ${fractionDenominator} - 2deg) calc(1turn / ${fractionDenominator})), conic-gradient(rgb(var(--color-primary)) 0 ${fractionNumerator / fractionDenominator}turn, white 0 1turn);`}
						></div>
					</div>
				{:else if currentProblem.op === 'time'}
					<svg viewBox="0 0 220 220" class="h-56 w-56">
						<circle cx="110" cy="110" r="98" fill="white" stroke="#334155" stroke-width="8" />
						{#each range(12) as i (i)}
							<text
								x={110 + 78 * Math.sin(((i + 1) * Math.PI) / 6)}
								y={116 - 78 * Math.cos(((i + 1) * Math.PI) / 6)}
								text-anchor="middle"
								class="fill-slate-700 text-lg font-black"
							>
								{i + 1}
							</text>
						{/each}
						<line
							x1="110"
							y1="110"
							x2="110"
							y2="58"
							stroke="#0f172a"
							stroke-width="8"
							stroke-linecap="round"
							transform={`rotate(${hourRotation} 110 110)`}
						/>
						<line
							x1="110"
							y1="110"
							x2="110"
							y2="34"
							stroke="rgb(var(--color-primary))"
							stroke-width="5"
							stroke-linecap="round"
							transform={`rotate(${minuteRotation} 110 110)`}
						/>
						<circle cx="110" cy="110" r="7" fill="#0f172a" />
					</svg>
				{:else if currentProblem.op === 'number-recognition'}
					<div class="text-center">
						<button
							type="button"
							on:click={() => speak(String(recognitionNumber))}
							class="mt-2 rounded-full bg-slate-800 px-5 py-3 font-bold text-white"
						>
							Hear it
						</button>
						<div class="mt-5 flex max-w-sm flex-wrap justify-center gap-2">
							{#each range(recognitionNumber) as i (i)}
								<span
									class="grid h-9 w-9 place-items-center rounded-full bg-amber-300 text-lg font-black text-amber-900"
								>
									*
								</span>
							{/each}
						</div>
					</div>
				{:else}
					<div
						class="flex flex-wrap items-center justify-center gap-4 text-6xl font-black text-slate-800"
					>
						<span>{currentProblem.num1}</span>
						<span class="text-primary">{currentProblem.symbol}</span>
						<span>{currentProblem.num2}</span>
						<span class="text-slate-400">=</span>
						<span class="text-slate-300">?</span>
					</div>
				{/if}

				{#if feedback === 'correct'}
					<p in:scale={{ duration: 180, start: 0.8 }} class="text-2xl font-black text-emerald-500">
						Correct!
					</p>
				{:else if feedback === 'wrong'}
					<p
						in:scale={{ duration: 180, start: 0.8 }}
						class="text-center text-2xl font-black text-rose-500"
					>
						Not quite. The answer is {currentProblem.answer}.
					</p>
				{:else}
					<div class="h-8"></div>
				{/if}

				{#if currentProblem.choices}
					<div class="grid w-full grid-cols-2 gap-3">
						{#each currentProblem.choices as choice}
							<button
								type="button"
								disabled={feedback !== null}
								on:click={() => chooseAnswer(choice)}
								class="hover:border-primary rounded-2xl border-4 border-slate-100 bg-slate-50 px-4 py-5 text-2xl font-black text-slate-800 shadow-sm transition hover:-translate-y-1 disabled:opacity-50"
							>
								{choice}
							</button>
						{/each}
					</div>
				{:else}
					<div class="flex w-full flex-col items-center gap-4">
						<input
							bind:this={inputEl}
							bind:value={userAnswer}
							on:keydown={handleKeydown}
							type="text"
							inputmode="numeric"
							aria-label="Your answer"
							placeholder="?"
							disabled={feedback !== null}
							class="focus:border-primary w-48 rounded-2xl border-4 border-slate-200 py-4 text-center text-5xl font-black focus:outline-none disabled:opacity-50"
						/>
						<button
							type="button"
							on:click={submitAnswer}
							disabled={feedback !== null || userAnswer.trim() === ''}
							class="bg-primary rounded-2xl px-12 py-4 text-xl font-black text-slate-900 shadow transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Check
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<div class="mt-12 text-center text-2xl font-black text-slate-400">Pick a child to start.</div>
		{/if}
	</section>
</div>

{#if showMilestone}
	<MilestoneAnimation count={milestoneCount} onDismiss={() => (showMilestone = false)} />
{/if}
