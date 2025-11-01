<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import ReadingGuideLine from '$lib/components/ReadingGuideLine.svelte';

	export let data: PageData;

	const storyHtml = marked(data.story.content);

	let selectedWord: string | null = null;
	let wordData: { phonetic: string; definition: string } | null = null;
	let isLoading = false;
	let popupPosition = { top: 0, left: 0 };
	let synth: SpeechSynthesis;
	const definitionCache = new Map<string, { phonetic: string; definition: string }>();

	let storyContentElement: HTMLElement;
	let lineHeight = 0;
	let guidePosition = { top: 0, visible: false };
	let longPressTimer: NodeJS.Timeout | null = null;
	let isLongPress = false;
	const LONG_PRESS_DURATION = 500; // 500ms for long press

	onMount(() => {
		synth = window.speechSynthesis;
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
		// Ensure we're not clicking something inside the popup
		if (target.closest('.fixed')) return;

		isLongPress = false;

		// Start timer for long press
		longPressTimer = setTimeout(() => {
			isLongPress = true;
			// Try to get the word at the click position
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;

			const range = selection.getRangeAt(0);
			const node = selection.anchorNode;

			if (node && node.nodeType === Node.TEXT_NODE && range.startOffset === range.endOffset) {
				const text = node.textContent || '';
				const clickedChar = text[range.startOffset] || text[range.startOffset - 1];
				
				if (clickedChar && clickedChar.match(/\w/)) {
					const wordRange = document.createRange();

					let start = range.startOffset;
					while (start > 0 && text[start - 1].match(/\w/)) {
						start--;
					}

					let end = range.startOffset;
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
		}, LONG_PRESS_DURATION);
	}

	function handleMouseUp(event: MouseEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		// If it wasn't a long press, treat it as a regular click for reading guide
		if (!isLongPress) {
			handleReadingGuideClick(event);
		}
		
		isLongPress = false;
	}

	function handleMouseLeave() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPress = false;
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
		if (definitionCache.has(cleanWord)) {
			wordData = definitionCache.get(cleanWord)!;
			isLoading = false;
			return;
		}

		try {
			const response = await fetch(`/api/define?word=${cleanWord}`);
			if (response.ok) {
				const data = await response.json();
				wordData = data;
				definitionCache.set(cleanWord, data); // Save to cache
			}
		} catch (error) {
			console.error('Failed to fetch definition:', error);
		} finally {
			isLoading = false;
		}
	}

	function speak(text: string) {
		if (synth.speaking) {
			synth.cancel();
		}
		const utterance = new SpeechSynthesisUtterance(text);
		synth.speak(utterance);
	}

	function closePopup() {
		selectedWord = null;
		wordData = null;
	}
</script>

<div class="bg-gray-50 min-h-screen">
	<div class="container mx-auto px-4 py-8">
		<div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
			<img
				src={data.story.image_url}
				alt="Story illustration"
				class="w-full h-150 object-fit"
			/>
			<div class="p-8 md:p-12">
				<h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Your New Story</h1>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div
					class="prose prose-lg max-w-none text-gray-700 text-2xl leading-relaxed relative"
					on:mousedown={handleMouseDown}
					on:mouseup={handleMouseUp}
					on:mouseleave={handleMouseLeave}
					bind:this={storyContentElement}
				>
					<ReadingGuideLine
						top={guidePosition.top}
						height={lineHeight}
						visible={guidePosition.visible}
					/>
					{@html storyHtml}
				</div>
				<div class="mt-8 pt-6 border-t">
					<a
						href="/"
						class="inline-block bg-indigo-600 text-white font-bold py-2 px-4 rounded hover:bg-indigo-700 transition-colors"
						>Create Another Story</a
					>
				</div>
			</div>
		</div>
	</div>
</div>

{#if selectedWord}
	<div
		class="fixed p-4 bg-white rounded-lg shadow-xl border w-64"
		style="top: {popupPosition.top}px; left: {popupPosition.left}px;"
	>
		<button
			class="absolute top-1 right-2 text-gray-500 hover:text-gray-800 text-2xl"
			on:click={closePopup}>&times;</button
		>
		<h3 class="font-bold text-lg mb-2">{selectedWord}</h3>
		{#if isLoading}
			<p class="text-sm text-gray-600">Loading...</p>
		{:else if wordData}
			<p class="text-sm text-gray-600 mb-2"><em>{wordData.phonetic}</em></p>
			<p class="text-sm mb-3">{wordData.definition}</p>
			<button
				class="text-sm bg-blue-500 text-white py-1 px-3 rounded hover:bg-blue-600"
				on:click={() => speak(wordData?.definition || '')}>Explain Word</button
			>
		{:else}
			<p class="text-sm text-red-500">Could not load definition.</p>
		{/if}
	</div>
{/if}
