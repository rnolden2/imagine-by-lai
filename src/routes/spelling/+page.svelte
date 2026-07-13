<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { fade, scale, fly } from 'svelte/transition';
	import { theme } from '$lib/stores';
	import MilestoneAnimation from '$lib/components/MilestoneAnimation.svelte';
	import { speak } from '$lib/tts';

	export let data: PageData;

	// ── User selection ───────────────────────────────────────────────
	let selectedUser: (typeof data.users)[0] | null = null;

	function selectUser(user: (typeof data.users)[0]) {
		selectedUser = user;
		$theme = user.gender === 'boy' ? 'theme-boy' : 'theme-girl';
		initSession(user);
	}

	// ── Word list ────────────────────────────────────────────────────
	let wordList: string[] = [];
	let currentIndex = 0;

	function buildWordList(user: (typeof data.users)[0]): string[] {
		const grade = user.grade;
		const defaults: string[] = data.gradeWordLists[grade] ?? data.gradeWordLists['1'];
		const custom = data.customWords.filter((w) => w.grade === grade).map((w) => w.word);
		return shuffle([...defaults, ...custom]);
	}

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// ── Session state ────────────────────────────────────────────────
	let sessionId = '';
	let correctWords: string[] = [];
	let missedWords: string[] = [];
	let sessionDone = false;

	onMount(() => {
		sessionId = crypto.randomUUID();
	});

	function initSession(user: (typeof data.users)[0]) {
		wordList = buildWordList(user);
		currentIndex = 0;
		correctWords = [];
		missedWords = [];
		sessionDone = false;
		loadWord(0);
	}

	function restartSession() {
		if (!selectedUser) return;
		sessionId = crypto.randomUUID();
		initSession(selectedUser);
	}

	// ── Current word & attempts ──────────────────────────────────────
	const MAX_ATTEMPTS = 3;
	let currentWord = '';
	let attempts = 0; // how many wrong attempts used on this word
	let userInput = '';
	let feedback: 'correct' | 'wrong' | 'failed' | null = null;
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl: HTMLInputElement;

	function loadWord(index: number) {
		if (index >= wordList.length) {
			sessionDone = true;
			return;
		}
		currentWord = wordList[index];
		attempts = 0;
		userInput = '';
		feedback = null;
		// Auto-play after a short delay so the page has settled
		setTimeout(() => speak(currentWord), 300);
		setTimeout(() => inputEl?.focus(), 350);
	}

	// ── Submit ───────────────────────────────────────────────────────
	function submit() {
		if (feedback !== null || userInput.trim() === '') return;

		const typed = userInput.trim().toLowerCase();
		const isCorrect = typed === currentWord.toLowerCase();

		if (isCorrect) {
			feedback = 'correct';
			correctWords = [...correctWords, currentWord];
			correctCount++;

			if (correctCount % 10 === 0) {
				milestoneCount = correctCount;
				showMilestone = true;
			}

			logAttempt(currentWord, attempts + 1, true);
			if (advanceTimer) clearTimeout(advanceTimer);
			advanceTimer = setTimeout(() => advance(), 900);
		} else {
			attempts++;
			if (attempts >= MAX_ATTEMPTS) {
				feedback = 'failed';
				missedWords = [...missedWords, currentWord];
				logAttempt(currentWord, MAX_ATTEMPTS, false);
				if (advanceTimer) clearTimeout(advanceTimer);
				advanceTimer = setTimeout(() => advance(), 2200);
			} else {
				feedback = 'wrong';
				// Replay word and clear feedback so they can try again
				setTimeout(() => speak(currentWord), 400);
				setTimeout(() => {
					feedback = null;
					userInput = '';
					inputEl?.focus();
				}, 1200);
			}
		}
	}

	function advance() {
		currentIndex++;
		loadWord(currentIndex);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') submit();
	}

	// ── Score tracking ───────────────────────────────────────────────
	let correctCount = 0;
	$: remaining = wordList.length - currentIndex;

	// ── Async log ────────────────────────────────────────────────────
	function logAttempt(word: string, attemptsUsed: number, isCorrect: boolean) {
		if (!selectedUser || !sessionId) return;
		fetch('/api/spelling', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId: selectedUser.id,
				sessionId,
				word,
				grade: selectedUser.grade,
				attemptsUsed,
				isCorrect
			})
		}).catch(() => {});
	}

	// ── Milestone ────────────────────────────────────────────────────
	let showMilestone = false;
	let milestoneCount = 0;

	// ── Attempt dots helper ──────────────────────────────────────────
	$: attemptDots = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i < attempts);
</script>

<div class="flex min-h-screen flex-col items-center bg-gray-100 px-4 pt-10 pb-16">
	<!-- User selector -->
	{#if data.users && data.users.length > 0}
		<div class="mb-8 text-center">
			<h2 class="mb-4 text-xl font-semibold">Who is spelling today?</h2>
			<div class="flex flex-wrap justify-center gap-4">
				{#each data.users as user}
					<button
						on:click={() => selectUser(user)}
						class="bg-primary rounded-xl px-6 py-3 text-lg font-bold text-black shadow transition-all hover:opacity-90"
						class:ring-4={selectedUser?.id === user.id}
						class:ring-secondary={selectedUser?.id === user.id}
					>
						{user.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if selectedUser && wordList.length > 0}
		{#if !sessionDone}
			<!-- Score bar -->
			<div
				in:fade={{ duration: 300 }}
				class="mb-6 flex w-full max-w-lg items-center justify-between rounded-2xl bg-white px-6 py-3 shadow"
			>
				<div class="text-center">
					<p class="text-3xl font-black text-green-500">{correctWords.length}</p>
					<p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Correct</p>
				</div>
				<div class="text-center">
					<p class="text-3xl font-black text-red-400">{missedWords.length}</p>
					<p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Missed</p>
				</div>
				<div class="text-center">
					<p class="text-primary text-3xl font-black">{remaining}</p>
					<p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Left</p>
				</div>
			</div>

			<!-- Problem card -->
			{#key currentWord}
				<div
					in:scale={{ duration: 220, start: 0.96 }}
					class="flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-lg"
				>
					<!-- Hear it button -->
					<button
						on:click={() => speak(currentWord)}
						class="group flex flex-col items-center gap-2"
						aria-label="Hear the word"
					>
						<div
							class="bg-primary/20 group-hover:bg-primary/40 flex h-20 w-20 items-center justify-center rounded-full transition-colors"
						>
							<svg class="text-primary h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
								/>
							</svg>
						</div>
						<span
							class="group-hover:text-primary text-sm font-semibold text-gray-500 transition-colors"
							>Hear it again</span
						>
					</button>

					<!-- Attempt dots -->
					<div class="flex items-center gap-3">
						{#each attemptDots as used, i}
							<div
								class="h-4 w-4 rounded-full transition-colors {used ? 'bg-red-400' : 'bg-gray-200'}"
								title="Attempt {i + 1}"
							></div>
						{/each}
						<span class="ml-1 text-sm text-gray-400">
							{attempts === 0
								? 'First try!'
								: `${MAX_ATTEMPTS - attempts} chance${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left`}
						</span>
					</div>

					<!-- Feedback -->
					{#if feedback === 'correct'}
						<p in:scale={{ duration: 200, start: 0.7 }} class="text-2xl font-bold text-green-500">
							"{currentWord}" — correct!
						</p>
					{:else if feedback === 'wrong'}
						<p in:scale={{ duration: 200, start: 0.7 }} class="text-2xl font-bold text-orange-400">
							Not quite — try again!
						</p>
					{:else if feedback === 'failed'}
						<div in:scale={{ duration: 200, start: 0.7 }} class="text-center">
							<p class="text-xl font-bold text-red-400">The word was:</p>
							<p class="mt-1 text-4xl font-black text-gray-800">{currentWord}</p>
						</div>
					{:else}
						<p class="text-lg font-medium text-gray-400">Type what you hear</p>
					{/if}

					<!-- Input -->
					<div class="flex w-full gap-3">
						<input
							bind:this={inputEl}
							bind:value={userInput}
							on:keydown={handleKeydown}
							type="text"
							autocomplete="off"
							autocorrect="off"
							autocapitalize="off"
							spellcheck="false"
							placeholder="Spell it here..."
							disabled={feedback !== null}
							class="focus:border-primary flex-1 rounded-2xl border-4 border-gray-200 py-4 text-center text-3xl font-bold tracking-widest transition-colors focus:outline-none disabled:opacity-50"
						/>
						<button
							on:click={submit}
							disabled={feedback !== null || userInput.trim() === ''}
							class="bg-primary rounded-2xl px-6 py-4 text-lg font-bold text-black shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Check
						</button>
					</div>

					<p class="text-sm text-gray-400">Press Enter or tap Check</p>
				</div>
			{/key}
		{:else}
			<!-- Session complete -->
			<div
				in:scale={{ duration: 300, start: 0.9 }}
				class="flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl bg-white p-10 text-center shadow-lg"
			>
				<p class="text-4xl font-black text-gray-800">All done!</p>
				<div class="flex gap-8">
					<div>
						<p class="text-5xl font-black text-green-500">{correctWords.length}</p>
						<p class="mt-1 text-sm font-semibold text-gray-500">Correct</p>
					</div>
					<div>
						<p class="text-5xl font-black text-red-400">{missedWords.length}</p>
						<p class="mt-1 text-sm font-semibold text-gray-500">Missed</p>
					</div>
				</div>
				<button
					on:click={restartSession}
					class="bg-primary mt-2 rounded-2xl px-8 py-4 text-lg font-bold text-black shadow-md transition-opacity hover:opacity-90"
				>
					Go Again!
				</button>
			</div>
		{/if}

		<!-- Word walls -->
		{#if correctWords.length > 0 || missedWords.length > 0}
			<div in:fade={{ duration: 300 }} class="mt-8 grid w-full max-w-lg grid-cols-2 gap-4">
				<!-- Correct -->
				<div class="rounded-2xl bg-white p-4 shadow">
					<h3 class="mb-3 text-sm font-bold tracking-wide text-green-600 uppercase">
						Got it ({correctWords.length})
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each correctWords as word}
							<span
								in:fly={{ y: 8, duration: 200 }}
								class="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"
							>
								{word}
							</span>
						{/each}
					</div>
				</div>

				<!-- Missed -->
				<div class="rounded-2xl bg-white p-4 shadow">
					<h3 class="mb-3 text-sm font-bold tracking-wide text-red-500 uppercase">
						Practice ({missedWords.length})
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each missedWords as word}
							<span
								in:fly={{ y: 8, duration: 200 }}
								class="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-600"
							>
								{word}
							</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{:else if !selectedUser}
		<div class="mt-12 text-center text-gray-400">
			<p class="text-2xl font-bold">Select a reader above to start!</p>
		</div>
	{/if}
</div>

{#if showMilestone}
	<MilestoneAnimation count={milestoneCount} onDismiss={() => (showMilestone = false)} />
{/if}
