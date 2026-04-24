<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { fade, scale, fly } from 'svelte/transition';
	import { theme } from '$lib/stores';
	import MilestoneAnimation from '$lib/components/MilestoneAnimation.svelte';

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

	// ── TTS ──────────────────────────────────────────────────────────
	function speak(word: string) {
		if (typeof window === 'undefined') return;
		const synth = window.speechSynthesis;
		if (synth.speaking) synth.cancel();
		const utt = new SpeechSynthesisUtterance(word);
		utt.rate = 0.85;
		utt.pitch = 1.1;
		synth.speak(utt);
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
	$: totalAnswered = correctWords.length + missedWords.length;
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

<div class="min-h-screen bg-gray-100 flex flex-col items-center pt-10 pb-16 px-4">

	<!-- User selector -->
	{#if data.users && data.users.length > 0}
		<div class="mb-8 text-center">
			<h2 class="text-xl font-semibold mb-4">Who is spelling today?</h2>
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

	{#if selectedUser && wordList.length > 0}

		{#if !sessionDone}
			<!-- Score bar -->
			<div
				in:fade={{ duration: 300 }}
				class="w-full max-w-lg mb-6 flex justify-between items-center bg-white rounded-2xl shadow px-6 py-3"
			>
				<div class="text-center">
					<p class="text-3xl font-black text-green-500">{correctWords.length}</p>
					<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Correct</p>
				</div>
				<div class="text-center">
					<p class="text-3xl font-black text-red-400">{missedWords.length}</p>
					<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Missed</p>
				</div>
				<div class="text-center">
					<p class="text-3xl font-black text-primary">{remaining}</p>
					<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Left</p>
				</div>
			</div>

			<!-- Problem card -->
			{#key currentWord}
				<div
					in:scale={{ duration: 220, start: 0.96 }}
					class="w-full max-w-lg bg-white rounded-3xl shadow-lg p-8 flex flex-col items-center gap-6"
				>
					<!-- Hear it button -->
					<button
						on:click={() => speak(currentWord)}
						class="flex flex-col items-center gap-2 group"
						aria-label="Hear the word"
					>
						<div class="w-20 h-20 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors flex items-center justify-center">
							<svg class="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 24 24">
								<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
							</svg>
						</div>
						<span class="text-sm font-semibold text-gray-500 group-hover:text-primary transition-colors">Hear it again</span>
					</button>

					<!-- Attempt dots -->
					<div class="flex gap-3 items-center">
						{#each attemptDots as used, i}
							<div
								class="w-4 h-4 rounded-full transition-colors {used ? 'bg-red-400' : 'bg-gray-200'}"
								title="Attempt {i + 1}"
							></div>
						{/each}
						<span class="text-sm text-gray-400 ml-1">
							{attempts === 0 ? 'First try!' : `${MAX_ATTEMPTS - attempts} chance${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left`}
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
							<p class="text-4xl font-black text-gray-800 mt-1">{currentWord}</p>
						</div>
					{:else}
						<p class="text-lg text-gray-400 font-medium">Type what you hear</p>
					{/if}

					<!-- Input -->
					<div class="flex gap-3 w-full">
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
							class="flex-1 text-center text-3xl font-bold rounded-2xl border-4 border-gray-200 focus:border-primary focus:outline-none py-4 transition-colors disabled:opacity-50 tracking-widest"
						/>
						<button
							on:click={submit}
							disabled={feedback !== null || userInput.trim() === ''}
							class="bg-primary text-black font-bold text-lg px-6 py-4 rounded-2xl hover:opacity-90 transition-opacity shadow disabled:opacity-40 disabled:cursor-not-allowed"
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
				class="w-full max-w-lg bg-white rounded-3xl shadow-lg p-10 text-center flex flex-col items-center gap-6"
			>
				<p class="text-4xl font-black text-gray-800">All done!</p>
				<div class="flex gap-8">
					<div>
						<p class="text-5xl font-black text-green-500">{correctWords.length}</p>
						<p class="text-sm text-gray-500 font-semibold mt-1">Correct</p>
					</div>
					<div>
						<p class="text-5xl font-black text-red-400">{missedWords.length}</p>
						<p class="text-sm text-gray-500 font-semibold mt-1">Missed</p>
					</div>
				</div>
				<button
					on:click={restartSession}
					class="bg-primary text-black font-bold text-lg px-8 py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-md mt-2"
				>
					Go Again!
				</button>
			</div>
		{/if}

		<!-- Word walls -->
		{#if correctWords.length > 0 || missedWords.length > 0}
			<div
				in:fade={{ duration: 300 }}
				class="w-full max-w-lg mt-8 grid grid-cols-2 gap-4"
			>
				<!-- Correct -->
				<div class="bg-white rounded-2xl shadow p-4">
					<h3 class="text-sm font-bold text-green-600 uppercase tracking-wide mb-3">
						Got it ({correctWords.length})
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each correctWords as word}
							<span
								in:fly={{ y: 8, duration: 200 }}
								class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold"
							>
								{word}
							</span>
						{/each}
					</div>
				</div>

				<!-- Missed -->
				<div class="bg-white rounded-2xl shadow p-4">
					<h3 class="text-sm font-bold text-red-500 uppercase tracking-wide mb-3">
						Practice ({missedWords.length})
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each missedWords as word}
							<span
								in:fly={{ y: 8, duration: 200 }}
								class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-semibold"
							>
								{word}
							</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}

	{:else if !selectedUser}
		<div class="text-center text-gray-400 mt-12">
			<p class="text-2xl font-bold">Select a reader above to start!</p>
		</div>
	{/if}

</div>

{#if showMilestone}
	<MilestoneAnimation count={milestoneCount} onDismiss={() => (showMilestone = false)} />
{/if}
