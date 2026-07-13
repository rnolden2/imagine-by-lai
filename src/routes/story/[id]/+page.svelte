<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import { fade } from 'svelte/transition';
	import ReadingGuideLine from '$lib/components/ReadingGuideLine.svelte';
	import { speak } from '$lib/tts';

	export let data: PageData;

	const storyHtml = marked(data.story.content);
	let showBanner = true;

	let selectedWord: string | null = null;
	let wordData: { phonetic: string; definition: string } | null = null;
	let isLoading = false;
	let popupPosition = { top: 0, left: 0 };
	const definitionCache: Record<string, { phonetic: string; definition: string }> = {};

	let storyContentElement: HTMLElement;
	let lineHeight = 0;
	let guidePosition = { top: 0, visible: false };
	let longPressTimer: NodeJS.Timeout | null = null;
	let isLongPress = false;
	let touchStartPos = { x: 0, y: 0 };
	const LONG_PRESS_DURATION = 500; // 500ms for long press
	const MOVE_THRESHOLD = 10; // pixels allowed to move during long press

	onMount(() => {
		setTimeout(() => (showBanner = false), 3000);
		if (storyContentElement) {
			const style = window.getComputedStyle(storyContentElement);
			lineHeight = parseFloat(style.lineHeight);
		}
	});

	function handleReadingGuideClick(event: MouseEvent) {
		if (!lineHeight || !storyContentElement) return;

		const rect = storyContentElement.getBoundingClientRect();
		const relativeY = event.clientY - rect.top;
		const lineIndex = Math.floor(relativeY / lineHeight);
		const newTop = lineIndex * lineHeight;

		guidePosition = {
			top: newTop,
			visible: true
		};
	}

	function handleMouseDown(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('.fixed')) return;

		isLongPress = false;
		touchStartPos = { x: event.clientX, y: event.clientY };

		longPressTimer = setTimeout(() => {
			isLongPress = true;
			tryShowWordDefinition(event.clientX, event.clientY);
		}, LONG_PRESS_DURATION);
	}

	function handleMouseUp(event: MouseEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (!isLongPress) {
			handleReadingGuideClick(event);
		}

		isLongPress = false;
	}

	function handleMouseMove(event: MouseEvent) {
		if (!longPressTimer) return;

		const moved =
			Math.abs(event.clientX - touchStartPos.x) > MOVE_THRESHOLD ||
			Math.abs(event.clientY - touchStartPos.y) > MOVE_THRESHOLD;

		if (moved && longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleTouchStart(event: TouchEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('.fixed')) return;

		const touch = event.touches[0];
		isLongPress = false;
		touchStartPos = { x: touch.clientX, y: touch.clientY };

		longPressTimer = setTimeout(() => {
			isLongPress = true;
			event.preventDefault(); // Prevent text selection menu
			tryShowWordDefinition(touch.clientX, touch.clientY);
		}, LONG_PRESS_DURATION);
	}

	function handleTouchEnd(event: TouchEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (!isLongPress && event.changedTouches.length > 0) {
			const touch = event.changedTouches[0];
			handleReadingGuideClick({ clientY: touch.clientY } as MouseEvent);
		}

		isLongPress = false;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!longPressTimer || event.touches.length === 0) return;

		const touch = event.touches[0];
		const moved =
			Math.abs(touch.clientX - touchStartPos.x) > MOVE_THRESHOLD ||
			Math.abs(touch.clientY - touchStartPos.y) > MOVE_THRESHOLD;

		if (moved && longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleTouchCancel() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPress = false;
	}

	function tryShowWordDefinition(clientX: number, clientY: number) {
		const selection = window.getSelection();
		if (!selection) return;

		// Create a range at the click/touch position
		const range = document.caretRangeFromPoint(clientX, clientY);
		if (!range) return;

		const node = range.startContainer;
		if (node && node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent || '';
			const offset = range.startOffset;
			const clickedChar = text[offset] || text[offset - 1];

			if (clickedChar && clickedChar.match(/\w/)) {
				const wordRange = document.createRange();

				let start = offset;
				while (start > 0 && text[start - 1].match(/\w/)) {
					start--;
				}

				let end = offset;
				while (end < text.length && text[end].match(/\w/)) {
					end++;
				}

				wordRange.setStart(node, start);
				wordRange.setEnd(node, end);

				const word = wordRange.toString().trim();
				if (word) {
					const rect = wordRange.getBoundingClientRect();
					handleWordSelection(word, rect);
				}
			}
		}
	}

	async function handleWordSelection(word: string, rect: DOMRect) {
		const cleanWord = word.trim().replace(/[.,!?;:]$/, '');
		if (!cleanWord) return;

		selectedWord = cleanWord;
		isLoading = true;
		wordData = null;

		// Calculate popup position, ensuring it stays within viewport
		const POPUP_WIDTH = 256; // w-64 class = 16rem = 256px
		const POPUP_MARGIN = 10; // margin from edge
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let left = rect.left;
		let top = rect.bottom + 5;

		// Check if popup would go off the right edge
		if (left + POPUP_WIDTH + POPUP_MARGIN > viewportWidth) {
			left = viewportWidth - POPUP_WIDTH - POPUP_MARGIN;
		}

		// Check if popup would go off the left edge
		if (left < POPUP_MARGIN) {
			left = POPUP_MARGIN;
		}

		// Check if popup would go off the bottom edge
		// Estimate popup height (can vary, but typically around 200px)
		const estimatedPopupHeight = 200;
		if (top + estimatedPopupHeight > viewportHeight) {
			// Position above the word instead
			top = rect.top - estimatedPopupHeight - 5;
			// If still off-screen at top, position at top margin
			if (top < POPUP_MARGIN) {
				top = POPUP_MARGIN;
			}
		}

		popupPosition = {
			top,
			left
		};

		// Check cache first
		if (definitionCache[cleanWord]) {
			wordData = definitionCache[cleanWord];
			isLoading = false;
			return;
		}

		try {
			const response = await fetch(`/api/define?word=${cleanWord}`);
			if (response.ok) {
				const data = await response.json();
				wordData = data;
				definitionCache[cleanWord] = data; // Save to cache
			}
		} catch (error) {
			console.error('Failed to fetch definition:', error);
		} finally {
			isLoading = false;
		}
	}

	function closePopup() {
		selectedWord = null;
		wordData = null;
	}
</script>

{#if showBanner}
	<div
		transition:fade={{ duration: 400 }}
		class="bg-primary fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-8 py-4 text-lg font-bold text-black shadow-xl"
	>
		Your story is ready!
	</div>
{/if}

<div class="min-h-screen bg-gray-50">
	<div class="container mx-auto px-4 py-8">
		<div class="mx-auto max-w-4xl overflow-hidden rounded-lg bg-white shadow-lg">
			<img
				src={data.story.image_url}
				alt="Story illustration"
				class="h-72 w-full object-cover md:h-96"
			/>
			<div class="p-8 md:p-12">
				<h1 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Your New Story</h1>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div
					class="prose prose-lg relative max-w-none text-2xl leading-relaxed text-gray-700"
					on:mousedown={handleMouseDown}
					on:mouseup={handleMouseUp}
					on:mousemove={handleMouseMove}
					on:touchstart={handleTouchStart}
					on:touchend={handleTouchEnd}
					on:touchmove={handleTouchMove}
					on:touchcancel={handleTouchCancel}
					bind:this={storyContentElement}
				>
					<ReadingGuideLine
						top={guidePosition.top}
						height={lineHeight}
						visible={guidePosition.visible}
					/>
					{@html storyHtml}
				</div>
				<div class="mt-8 border-t pt-6">
					<a
						href="/"
						class="bg-primary inline-block rounded-xl px-6 py-3 font-bold text-black shadow-md transition-opacity hover:opacity-90"
						>Create Another Story</a
					>
				</div>
			</div>
		</div>
	</div>
</div>

{#if selectedWord}
	<div
		class="fixed w-64 rounded-lg border bg-white p-4 shadow-xl"
		style="top: {popupPosition.top}px; left: {popupPosition.left}px;"
	>
		<button
			class="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full text-2xl text-gray-500 hover:bg-gray-100 hover:text-gray-800"
			on:click={closePopup}>&times;</button
		>
		<h3 class="mb-2 text-lg font-bold">{selectedWord}</h3>
		{#if isLoading}
			<p class="text-sm text-gray-600">Loading...</p>
		{:else if wordData}
			<p class="mb-2 text-sm text-gray-600"><em>{wordData.phonetic}</em></p>
			<p class="mb-3 text-sm">{wordData.definition}</p>
			<button
				class="bg-primary rounded-lg px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
				on:click={() => speak(wordData?.definition || '')}>Explain Word</button
			>
		{:else}
			<p class="text-sm text-red-500">Could not load definition.</p>
		{/if}
	</div>
{/if}
