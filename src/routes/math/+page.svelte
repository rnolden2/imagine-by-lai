<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { theme } from '$lib/stores';
	import MilestoneAnimation from '$lib/components/MilestoneAnimation.svelte';

	export let data: PageData;

	// ── User selection ──────────────────────────────────────────────
	let selectedUser: (typeof data.users)[0] | null = null;

	type Settings = { operations: string[]; maxNumber: number };

	function getDefaultSettings(grade: string): Settings {
		if (grade === 'TK' || grade === 'K') return { operations: ['addition'], maxNumber: 10 };
		if (grade === '1') return { operations: ['addition', 'subtraction'], maxNumber: 10 };
		if (grade === '2') return { operations: ['addition', 'subtraction'], maxNumber: 100 };
		return { operations: ['addition', 'subtraction', 'multiplication'], maxNumber: 100 };
	}

	function resolveSettings(userId: number, grade: string): Settings {
		const saved = data.mathSettings.find((s) => s.user_id === userId);
		if (saved) {
			return {
				operations: saved.operations.split(',').filter(Boolean),
				maxNumber: saved.max_number
			};
		}
		return getDefaultSettings(grade);
	}

	let currentSettings: Settings | null = null;

	function selectUser(user: (typeof data.users)[0]) {
		selectedUser = user;
		$theme = user.gender === 'boy' ? 'theme-boy' : 'theme-girl';
		currentSettings = resolveSettings(user.id, user.grade);
		startSession();
	}

	// ── Session ─────────────────────────────────────────────────────
	let sessionId = '';
	let correctCount = 0;
	let totalCount = 0;

	onMount(() => {
		sessionId = crypto.randomUUID();
	});

	function startSession() {
		correctCount = 0;
		totalCount = 0;
		nextProblem();
	}

	// ── Problem generation ───────────────────────────────────────────
	const SYMBOLS: Record<string, string> = {
		addition: '+',
		subtraction: '−',
		multiplication: '×',
		division: '÷'
	};

	type Problem = { op: string; num1: number; num2: number; answer: number; symbol: string };
	let currentProblem: Problem | null = null;

	function generateProblem(): Problem {
		const ops = currentSettings!.operations;
		const op = ops[Math.floor(Math.random() * ops.length)];
		const max = currentSettings!.maxNumber;
		let num1: number, num2: number, answer: number;

		if (op === 'subtraction') {
			num1 = Math.floor(Math.random() * (max - 1)) + 2;
			num2 = Math.floor(Math.random() * (num1 - 1)) + 1;
			answer = num1 - num2;
		} else if (op === 'multiplication') {
			const cap = Math.min(max, 12);
			num1 = Math.floor(Math.random() * cap) + 1;
			num2 = Math.floor(Math.random() * cap) + 1;
			answer = num1 * num2;
		} else if (op === 'division') {
			const cap = Math.min(max, 12);
			num2 = Math.floor(Math.random() * cap) + 1;
			const quotient = Math.floor(Math.random() * cap) + 1;
			num1 = num2 * quotient;
			answer = quotient;
		} else {
			// addition
			num1 = Math.floor(Math.random() * max) + 1;
			num2 = Math.floor(Math.random() * max) + 1;
			answer = num1 + num2;
		}

		return { op, num1, num2, answer, symbol: SYMBOLS[op] };
	}

	// ── Answer input & feedback ──────────────────────────────────────
	let userAnswer = '';
	let feedback: 'correct' | 'wrong' | null = null;
	let showCorrectAnswer = false;
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl: HTMLInputElement;

	function nextProblem() {
		currentProblem = generateProblem();
		userAnswer = '';
		feedback = null;
		showCorrectAnswer = false;
		setTimeout(() => inputEl?.focus(), 80);
	}

	async function submitAnswer() {
		if (!currentProblem || userAnswer.trim() === '') return;

		const given = parseInt(userAnswer);
		if (isNaN(given)) return;

		const isCorrect = given === currentProblem.answer;
		totalCount++;

		if (isCorrect) {
			correctCount++;
			feedback = 'correct';
			if (correctCount % 10 === 0) {
				milestoneCount = correctCount;
				showMilestone = true;
			}
		} else {
			feedback = 'wrong';
			showCorrectAnswer = true;
		}

		// Fire-and-forget log
		if (selectedUser && sessionId) {
			fetch('/api/math', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: selectedUser.id,
					sessionId,
					operation: currentProblem.op,
					num1: currentProblem.num1,
					num2: currentProblem.num2,
					correctAnswer: currentProblem.answer,
					givenAnswer: given,
					isCorrect
				})
			}).catch(() => {});
		}

		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => nextProblem(), isCorrect ? 700 : 1800);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAnswer();
	}

	// ── Milestone ────────────────────────────────────────────────────
	let showMilestone = false;
	let milestoneCount = 0;

	function dismissMilestone() {
		showMilestone = false;
	}

	// ── Accuracy ─────────────────────────────────────────────────────
	$: accuracy = totalCount === 0 ? 100 : Math.round((correctCount / totalCount) * 100);
</script>

<div class="min-h-screen bg-gray-100 flex flex-col items-center pt-10 pb-16 px-4">
	<!-- User selection -->
	{#if data.users && data.users.length > 0}
		<div class="mb-8 text-center">
			<h2 class="text-xl font-semibold mb-4">Who is doing math today?</h2>
			<div class="flex gap-4 flex-wrap justify-center">
				{#each data.users as user}
					<button
						on:click={() => selectUser(user)}
						class="px-6 py-3 rounded-xl shadow font-bold text-black bg-primary hover:opacity-90 transition-all text-lg"
						class:ring-4={selectedUser?.id === user.id}
						class:ring-secondary={selectedUser?.id === user.id}
					>
						{user.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if selectedUser && currentProblem && currentSettings}
		<!-- Score bar -->
		<div
			in:fade={{ duration: 300 }}
			class="w-full max-w-md mb-6 flex justify-between items-center bg-white rounded-2xl shadow px-6 py-3"
		>
			<div class="text-center">
				<p class="text-3xl font-black text-green-500">{correctCount}</p>
				<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Correct</p>
			</div>
			<div class="text-center">
				<p class="text-3xl font-black text-gray-400">{totalCount}</p>
				<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</p>
			</div>
			<div class="text-center">
				<p class="text-3xl font-black text-primary">{accuracy}%</p>
				<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Accuracy</p>
			</div>
		</div>

		<!-- Problem card -->
		<div
			in:scale={{ duration: 250, start: 0.95 }}
			class="w-full max-w-md bg-white rounded-3xl shadow-lg p-10 flex flex-col items-center gap-8"
		>
			<!-- The equation -->
			<div class="flex items-center gap-6 text-7xl font-black text-gray-800 select-none">
				<span>{currentProblem.num1}</span>
				<span class="text-primary">{currentProblem.symbol}</span>
				<span>{currentProblem.num2}</span>
				<span class="text-gray-400">=</span>
				<span class="text-gray-300">?</span>
			</div>

			<!-- Feedback -->
			{#if feedback === 'correct'}
				<p
					in:scale={{ duration: 200, start: 0.7 }}
					class="text-2xl font-bold text-green-500"
				>
					Correct!
				</p>
			{:else if feedback === 'wrong'}
				<div in:scale={{ duration: 200, start: 0.7 }} class="text-center">
					<p class="text-2xl font-bold text-red-400">Not quite!</p>
					{#if showCorrectAnswer}
						<p class="text-lg text-gray-600 mt-1">
							The answer is <span class="font-black text-gray-800">{currentProblem.answer}</span>
						</p>
					{/if}
				</div>
			{:else}
				<!-- Spacer to prevent layout shift -->
				<div class="h-8"></div>
			{/if}

			<!-- Answer input -->
			<div class="flex gap-4 w-full items-center">
				<input
					bind:this={inputEl}
					bind:value={userAnswer}
					on:keydown={handleKeydown}
					type="number"
					inputmode="numeric"
					pattern="[0-9]*"
					placeholder="?"
					disabled={feedback !== null}
					class="flex-1 text-center text-5xl font-black rounded-2xl border-4 border-gray-200 focus:border-primary focus:outline-none py-4 transition-colors disabled:opacity-50"
				/>
				<button
					on:click={submitAnswer}
					disabled={feedback !== null || userAnswer.trim() === ''}
					class="bg-primary text-black font-bold text-lg px-8 py-4 rounded-2xl hover:opacity-90 transition-opacity shadow disabled:opacity-40 disabled:cursor-not-allowed"
				>
					Check
				</button>
			</div>

			<p class="text-sm text-gray-400">Press Enter or tap Check</p>
		</div>

		<!-- Next milestone hint -->
		{#if correctCount > 0}
			{@const nextMilestone = Math.ceil(correctCount / 10) * 10}
			{@const needed = nextMilestone - correctCount}
			{#if needed > 0 && needed <= 3}
				<p
					in:fade={{ duration: 300 }}
					class="mt-6 text-base font-semibold text-primary"
				>
					{needed} more correct to reach {nextMilestone}!
				</p>
			{/if}
		{/if}
	{:else if !selectedUser}
		<div class="text-center text-gray-400 mt-12">
			<p class="text-2xl font-bold">Select a reader above to start!</p>
		</div>
	{/if}
</div>

{#if showMilestone}
	<MilestoneAnimation count={milestoneCount} onDismiss={dismissMilestone} />
{/if}
