<script lang="ts">
	import { resolve } from '$app/paths';
	import CookingAction from '$lib/games/word-kitchen/CookingAction.svelte';
	import CookingAnimation from '$lib/games/word-kitchen/CookingAnimation.svelte';
	import { onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { GameEvent } from '$lib/games/word-kitchen/contracts';
	let { data }: { data: PageData } = $props();
	let game = $state(untrack(() => data.session));
	let answer = $state('');
	let busy = $state(false);
	let message = $state('');
	let pending = $state<GameEvent | null>(null);
	let usedTiles = $state<string[]>([]);
	let animating = $state(false);
	let gestureProgress = $state(0);
	let actionTimer: ReturnType<typeof setTimeout> | undefined;
	let muted = $state(false);
	let audio: HTMLAudioElement | undefined;
	let audioUrl = '';
	let audioRequest: AbortController | undefined;
	let audioVersion = 0;
	const step = $derived(game.step);
	const endpoint = $derived(`/api/games/word-kitchen/session/${game.id}`);
	const storageKey = $derived(`word-kitchen:pending:${game.id}`);
	const sceneAssets = $derived(
		Object.values(game.manifest).filter((a) =>
			step?.kind === 'decoration' || step?.kind === 'finish'
				? a.conceptId.startsWith('dish:')
				: a.conceptId === 'tool:bowl'
		)
	);
	const cookingAssets = $derived.by(() => {
		const assets = Object.values(game.manifest);
		const find = (concept: string) => assets.find((asset) => asset.conceptId === concept);
		const object = find(step?.actionObject ?? '');
		const ingredients = assets.filter((asset) => asset.conceptId.startsWith('ingredient:'));
		const ingredient = object?.conceptId.startsWith('ingredient:')
			? object
			: (ingredients.find((asset) =>
					step?.action.toLowerCase().includes(asset.label.toLowerCase())
				) ?? ingredients[0]);
		const vessel =
			object && ['tool:bowl', 'tool:pan', 'tool:plate'].includes(object.conceptId)
				? object
				: find('tool:bowl');
		const tool = find(
			/flip/i.test(step?.action ?? '')
				? 'tool:spatula'
				: step?.mechanic === 'whisk'
					? 'tool:whisk'
					: 'tool:spoon'
		);
		return {
			ingredient,
			vessel,
			tool,
			cup: find('tool:cup'),
			dish: assets.find((asset) => asset.conceptId.startsWith('dish:'))
		};
	});
	function stopAudio() {
		audioVersion++;
		audioRequest?.abort();
		audio?.pause();
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		audioUrl = '';
		window.speechSynthesis?.cancel();
	}
	function remember(event: GameEvent | null) {
		pending = event;
		try {
			if (event)
				localStorage.setItem(storageKey, JSON.stringify({ expiresAt: game.expiresAt, event }));
			else localStorage.removeItem(storageKey);
		} catch {
			/* In-memory retry remains available when storage is disabled. */
		}
	}
	async function refresh() {
		const r = await fetch(endpoint);
		if (r.ok) game = await r.json();
	}
	async function deliver(event: GameEvent) {
		if (busy) return;
		busy = true;
		message = '';
		stopAudio();
		try {
			const r = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(event)
			});
			const b = await r.json();
			if (!r.ok) {
				if ([400, 403, 404, 409, 410].includes(r.status)) {
					remember(null);
					await refresh();
				}
				throw new Error(b.message ?? 'Your progress could not be saved.');
			}
			game = b;
			gestureProgress = 0;
			remember(null);
			answer = '';
			usedTiles = [];
		} catch (e) {
			message =
				e instanceof Error
					? e.message
					: 'Connection interrupted. Your move is saved on this device. Retry when connected.';
		} finally {
			busy = false;
		}
	}
	function send(type: GameEvent['type'], payload: GameEvent['payload'] = {}) {
		if (!step || busy || pending) return;
		const event = {
			eventId: crypto.randomUUID(),
			expectedSequence: game.sequence,
			stepId: step.id,
			type,
			payload
		};
		remember(event);
		void deliver(event);
	}
	async function speak(slow = false) {
		if (!step || muted) return;
		stopAudio();
		const version = audioVersion;
		audioRequest = new AbortController();
		try {
			const r = await fetch(`${endpoint}/audio`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stepId: step.id, slow }),
				signal: audioRequest.signal
			});
			if (!r.ok) throw new Error('Audio unavailable');
			if (version !== audioVersion) return;
			if (r.headers.get('content-type')?.includes('audio/')) {
				audioUrl = URL.createObjectURL(await r.blob());
				if (version !== audioVersion) return;
				audio = new Audio(audioUrl);
				await audio.play();
			} else {
				const b = await r.json();
				if (!window.speechSynthesis || !b.browserFallback) throw new Error('Audio unavailable');
				const speech = new SpeechSynthesisUtterance(b.browserFallback);
				speech.lang = 'en-US';
				speech.rate = slow ? 0.65 : 0.9;
				speech.onerror = () => {
					message = 'Sound is unavailable. Use “Show me” to practice with the written word.';
				};
				window.speechSynthesis.speak(speech);
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			message = 'Sound is unavailable. Use “Show me” to practice with the written word.';
		}
	}
	function tile(id: string, letter: string) {
		if (!usedTiles.includes(id)) {
			usedTiles = [...usedTiles, id];
			answer += letter;
		}
	}
	function action() {
		if (!step || busy || pending || animating) return;
		if (step.kind !== 'action') {
			send('complete_action', { action: step.mechanic });
			return;
		}
		const actionStep = step;
		animating = true;
		actionTimer = setTimeout(
			() => {
				animating = false;
				if (step?.id === actionStep.id) send('complete_action', { action: actionStep.mechanic });
			},
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1050
		);
	}
	function decorate(conceptId: string) {
		if (busy || pending) return;
		const n = game.decorations.length;
		if (n >= 12) return;
		send('set_decoration', {
			placements: [
				...game.decorations,
				{ conceptId, x: 0.25 + (n % 4) * 0.16, y: 0.3 + Math.floor(n / 4) * 0.16 }
			]
		});
	}
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			if (saved && Date.parse(saved.expiresAt) > Date.now()) {
				pending = saved.event;
				void deliver(saved.event);
			} else localStorage.removeItem(storageKey);
			for (let i = localStorage.length - 1; i >= 0; i--) {
				const key = localStorage.key(i);
				if (key?.startsWith('word-kitchen:pending:')) {
					try {
						const entry = JSON.parse(localStorage.getItem(key) ?? '{}');
						if (Date.parse(entry.expiresAt) < Date.now()) localStorage.removeItem(key);
					} catch {
						localStorage.removeItem(key);
					}
				}
			}
		} catch {
			/* Stored events are optional. */
		}
		const online = () => {
			if (pending) void deliver(pending);
		};
		window.addEventListener('online', online);
		const timer = setInterval(() => {
			if (
				!busy &&
				!pending &&
				Object.values(game.manifest).some((a) => Date.parse(a.expiresAt) < Date.now() + 300000)
			)
				void refresh();
		}, 60000);
		return () => {
			stopAudio();
			clearInterval(timer);
			clearTimeout(actionTimer);
			window.removeEventListener('online', online);
		};
	});
</script>

<svelte:head
	><title>{game.title} · Word Kitchen</title><meta name="robots" content="noindex" /></svelte:head
>
<div class="kitchen-shell">
	<header class="kitchen-top">
		<a href={resolve('/games/word-kitchen')} onclick={stopAudio}>← Recipe book</a><strong
			>{game.title}</strong
		><button
			onclick={() => {
				muted = !muted;
				stopAudio();
			}}
			aria-pressed={muted}>{muted ? 'Sound off' : 'Sound on'}</button
		>
	</header>
	{#if game.preview}<p class="preview-banner">
			Parent preview · Practice and points will not be saved to learning history.
		</p>{/if}
	<div class="progress">
		<div style={`width:${(100 * game.completedSteps) / game.totalSteps}%`}></div>
	</div>
	{#if game.results}<section class="results">
			<span class="text-6xl" aria-hidden="true">✦</span>
			<h1>{game.status === 'completed' ? 'Look what you made!' : 'Thanks for cooking with us.'}</h1>
			<p>
				{game.status === 'completed'
					? 'A delicious bit of practice. Your kitchen is always here.'
					: 'You can choose a new recipe whenever you’re ready.'}
			</p>
			<div class="metrics">
				<div><b>{game.preview ? 0 : game.results.points}</b><span>Chef Points</span></div>
				<div><b>{game.results.uniqueWords}</b><span>Words practiced</span></div>
				<div><b>{game.results.firstTryIndependent}</b><span>First-try answers</span></div>
			</div>
			<a class="primary" href={resolve('/games/word-kitchen')}>Back to the recipe book</a>
		</section>
	{:else if step}
		<div class="kitchen-grid">
			<section class="scene" aria-label="Your pretend kitchen">
				<img
					class="backdrop"
					src={Object.values(game.manifest).find((a) => a.conceptId === 'environment:kitchen')?.url}
					alt=""
				/>
				<div class="shelf"><span>✦ WORD KITCHEN ✦</span></div>
				<div class="counter"></div>
				{#if step.kind === 'action'}
					<div class="cooking-stage">
						{#key step.id}<CookingAnimation
								mechanic={step.mechanic}
								label={step.action}
								active={animating}
								progress={gestureProgress}
								ingredientUrl={cookingAssets.ingredient?.url}
								vesselUrl={cookingAssets.vessel?.url}
								toolUrl={cookingAssets.tool?.url}
								cupUrl={cookingAssets.cup?.url}
								dishUrl={cookingAssets.dish?.url}
							/>{/key}
					</div>
				{:else}<div class="dish">
						{#each sceneAssets as asset, assetIndex (assetIndex)}<img
								src={asset.url}
								alt={asset.label}
								width="256"
								height="256"
								draggable="false"
							/>{/each}{#each game.decorations as placement, i (i)}<img
								class="decoration"
								src={Object.values(game.manifest).find((a) => a.conceptId === placement.conceptId)
									?.url}
								alt={`Decoration ${i + 1}`}
								style={`left:${placement.x * 100}%;top:${placement.y * 100}%`}
								width="64"
								height="64"
							/>{/each}
					</div>{/if}
				{#if step.kind !== 'action'}<div class="ingredients">
						{#each step.assetRoles as role, roleIndex (roleIndex)}{@const asset =
								game.manifest[role]}{#if asset}<img
									src={asset.url}
									alt={asset.label}
									width="90"
									height="90"
								/>{/if}{/each}
					</div>{/if}
				<p class="scene-caption">
					{Object.keys(game.scene).length
						? 'Your recipe is coming together.'
						: 'A fresh start. Let’s make something good.'}
				</p>
			</section>
			<section class="play-panel" aria-label="Cooking step">
				<p class="eyebrow">
					{step.review ? 'CHEF’S CHALLENGE' : `STEP ${step.position} OF ${game.totalSteps}`}
				</p>
				<h1 tabindex="-1">{step.instruction}</h1>
				<p class="feedback" aria-live="polite">{game.feedback}</p>
				{#if game.status === 'paused'}<p>The kitchen is taking a little break.</p>
					<button class="primary" onclick={() => send('resume')}>Ready to continue</button>
				{:else if step.kind === 'challenge'}
					<div class="audio-controls">
						<button onclick={() => speak()} disabled={busy || muted}>▶ Hear it</button><button
							onclick={() => speak(true)}
							disabled={busy || muted}>Hear slowly</button
						>
					</div>
					{#if step.revealedAnswer}<p class="word-reveal">{step.revealedAnswer}</p>
						<button
							class="primary"
							disabled={busy || !!pending}
							onclick={() => send('submit_answer', { answer: '__guided_continue__' })}
							>Continue together →</button
						>
					{:else if step.choices.length}<div class="choices">
							{#each step.choices as choice (choice.id)}<button
									disabled={busy || !!pending}
									onclick={() => send('submit_answer', { answer: choice.id })}
									>{#if choice.conceptId}{@const asset = Object.values(game.manifest).find(
											(a) => a.conceptId === choice.conceptId
										)}{#if asset}<img
												src={asset.url}
												alt=""
												width="76"
												height="76"
											/>{/if}{/if}{choice.label}</button
								>{/each}
						</div>
					{:else}<form
							onsubmit={(e) => {
								e.preventDefault();
								send('submit_answer', { answer });
							}}
						>
							<label for="word-answer"
								>{step.mask ? `Fill the missing letters: ${step.mask}` : 'Your spelling'}</label
							>{#if step.tiles.length}<div class="tiles" aria-label="Letter tiles">
									{#each step.tiles as t (t.id)}<button
											type="button"
											disabled={usedTiles.includes(t.id) || busy || !!pending}
											aria-label={`Add letter ${t.letter}`}
											onclick={() => tile(t.id, t.letter)}>{t.letter}</button
										>{/each}<button
										type="button"
										onclick={() => {
											answer = '';
											usedTiles = [];
										}}>Clear</button
									>
								</div>{/if}<input
								id="word-answer"
								bind:value={answer}
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								maxlength="240"
								disabled={busy || !!pending}
							/><button class="primary" disabled={!answer.trim() || busy || !!pending}
								>Check my word →</button
							>
						</form>{/if}
					{#if step.hint}<p class="hint">{step.hint}</p>{/if}
					<div class="help">
						<button disabled={busy || !!pending} onclick={() => send('request_hint')}
							>A little hint</button
						><button disabled={busy || !!pending} onclick={() => send('reveal_answer')}
							>Show me</button
						>
					</div>
				{:else if step.mechanic === 'decorate'}<div class="choices">
						{#each step.assetRoles as role, roleIndex (roleIndex)}{@const asset =
								game.manifest[role]}{#if asset}<button
									disabled={busy || !!pending || game.decorations.length >= 12}
									onclick={() => decorate(asset.conceptId)}
									><img src={asset.url} alt="" width="64" height="64" />Add {asset.label}</button
								>{/if}{/each}
					</div>
					<button
						onclick={() => send('set_decoration', { placements: [] })}
						disabled={busy || !!pending}>Start decoration over</button
					><button class="primary" onclick={action} disabled={busy || !!pending || animating}
						>Finish decorating →</button
					>
				{:else}<p>{step.quantityLabel ?? ''}</p>
					{#if step.kind === 'action'}{#key step.id}<CookingAction
								mechanic={step.mechanic}
								label={step.action}
								imageUrl={['stir', 'whisk'].includes(step.mechanic)
									? cookingAssets.tool?.url
									: ['measure', 'pour'].includes(step.mechanic)
										? cookingAssets.cup?.url
										: step.mechanic === 'timer'
											? cookingAssets.vessel?.url
											: cookingAssets.ingredient?.url}
								disabled={busy || !!pending || animating}
								onprogress={(value) => (gestureProgress = value)}
								oncomplete={action}
							/>{/key}{/if}
					<button
						class="primary action-button"
						onclick={action}
						disabled={busy || !!pending || animating}
						>{animating ? 'Cooking…' : step.action}
						{step.mechanic === 'timer' ? '(skip wait)' : '→'}</button
					>
					<p class="gentle">Tap or use Enter. You can take your time.</p>{/if}
				<p role="alert" class="error">{message}</p>
				{#if pending && !busy}<button class="primary" onclick={() => pending && deliver(pending)}
						>Retry saved move</button
					>{/if}
				<div class="session-controls">
					<button
						disabled={busy || !!pending || animating}
						onclick={() => send(game.status === 'paused' ? 'resume' : 'pause')}
						>{game.status === 'paused' ? 'Resume' : 'Take a break'}</button
					><button disabled={busy || !!pending || animating} onclick={() => send('abandon')}
						>Finish for now</button
					>
				</div>
			</section>
		</div>{/if}
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.45;
	}
	.shelf {
		position: relative;
		z-index: 1;
	}
	.kitchen-shell {
		min-height: calc(100vh - 70px);
		background: #fffaf0;
		color: #183e3d;
		padding: 20px clamp(16px, 4vw, 64px) 50px;
	}
	.kitchen-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0 24px;
		font-weight: 800;
	}
	.progress {
		height: 8px;
		background: #e9e4d7;
		border-radius: 10px;
		overflow: hidden;
		margin-bottom: 32px;
	}
	.progress div {
		height: 100%;
		background: #eab15b;
		transition: width 0.3s;
	}
	.kitchen-grid {
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		gap: 40px;
		max-width: 1300px;
		margin: auto;
	}
	.scene {
		position: relative;
		min-height: 540px;
		border-radius: 32px;
		overflow: hidden;
		background: linear-gradient(180deg, #dfefea 65%, #ebcea3 65%);
		box-shadow: inset 0 0 0 1px #c5dbd2;
	}
	.shelf {
		margin-top: 60px;
		padding: 20px;
		text-align: center;
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 3px;
		border-bottom: 12px solid #a8c7b4;
	}
	.dish {
		position: absolute;
		top: 32%;
		left: 5%;
		width: 90%;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.cooking-stage {
		position: absolute;
		top: 24%;
		left: 8%;
		width: 84%;
		height: 52%;
	}
	.dish > img:not(.decoration) {
		width: 48%;
		height: auto;
		object-fit: contain;
	}
	.decoration {
		position: absolute;
		width: 54px;
		height: 54px;
		object-fit: contain;
	}
	.ingredients {
		position: absolute;
		bottom: 60px;
		width: 100%;
		display: flex;
		justify-content: center;
		gap: 8px;
	}
	.ingredients img {
		width: 80px;
		height: 80px;
		object-fit: contain;
	}
	.scene-caption {
		position: absolute;
		bottom: 18px;
		width: 100%;
		text-align: center;
		font-size: 12px;
		padding: 0 16px;
	}
	.play-panel {
		padding: 20px 0;
	}
	.eyebrow {
		font-weight: 800;
		letter-spacing: 2px;
		font-size: 12px;
		color: #887146;
	}
	h1 {
		font-size: clamp(25px, 3vw, 38px);
		font-weight: 800;
		line-height: 1.2;
		margin: 16px 0;
	}
	.feedback {
		min-height: 24px;
		color: #267268;
		margin-bottom: 16px;
	}
	.primary {
		display: block;
		text-align: center;
		width: 100%;
		background: #185b50;
		color: white;
		padding: 16px 20px;
		border-radius: 16px;
		font-weight: 800;
		margin-top: 16px;
		min-height: 52px;
	}
	button {
		min-height: 44px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button:focus-visible,
	a:focus-visible,
	input:focus-visible {
		outline: 3px solid #db863a;
		outline-offset: 4px;
	}
	.audio-controls,
	.help,
	.session-controls {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.audio-controls button,
	.help button {
		padding: 8px 14px;
		background: #e8efea;
		border-radius: 12px;
		font-weight: 700;
	}
	.help {
		margin-top: 20px;
	}
	.session-controls {
		margin-top: 32px;
		border-top: 1px solid #e7dfd0;
		justify-content: space-between;
		font-size: 14px;
		color: #51655e;
	}
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin: 12px 0;
	}
	.choices button {
		background: white;
		border: 2px solid #d7e2d7;
		border-radius: 18px;
		padding: 12px;
		font-weight: 700;
		display: flex;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		min-height: 80px;
	}
	.choices img {
		object-fit: contain;
	}
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 16px 0;
	}
	.tiles button {
		min-width: 44px;
		padding: 8px;
		border-radius: 10px;
		background: #f8deb0;
		font-size: 20px;
		font-weight: 800;
	}
	input {
		width: 100%;
		border: 2px solid #afc3b7;
		border-radius: 14px;
		padding: 14px;
		margin: 12px 0;
		font-size: 24px;
	}
	label {
		font-weight: 700;
	}
	.word-reveal {
		font-size: 32px;
		font-weight: 800;
		padding: 18px;
		background: #ffedbd;
		border-radius: 16px;
	}
	.hint {
		padding: 12px;
		margin-top: 12px;
		background: #fff0d0;
		border-radius: 12px;
	}
	.gentle {
		font-size: 13px;
		color: #64736c;
		margin-top: 12px;
	}
	.error {
		color: #a03824;
		margin-top: 16px;
	}
	.preview-banner {
		background: #eadffd;
		padding: 12px;
		border-radius: 12px;
		margin-bottom: 16px;
	}
	.results {
		text-align: center;
		max-width: 680px;
		margin: 64px auto;
	}
	.metrics {
		display: flex;
		justify-content: center;
		gap: 36px;
		margin: 40px 0;
	}
	.metrics div {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.metrics b {
		font-size: 36px;
	}
	@media (max-width: 800px) {
		.kitchen-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.scene {
			min-height: 270px;
		}
		.shelf {
			margin-top: 8px;
		}
		.dish {
			top: 20%;
		}
		.cooking-stage {
			top: 19%;
			height: 58%;
		}
		.dish > img:not(.decoration) {
			width: 30%;
		}
		.ingredients {
			bottom: 34px;
		}
		.ingredients img {
			width: 55px;
			height: 55px;
		}
		.scene-caption {
			bottom: 9px;
		}
		.play-panel {
			padding: 12px 0;
		}
		.metrics {
			gap: 18px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress div {
			transition: none;
		}
	}
</style>
