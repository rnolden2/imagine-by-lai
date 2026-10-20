<script lang="ts">
	import type { PageData } from './$types';
	import { tick } from 'svelte';
	import Constellation from '$lib/science/Constellation.svelte';
	import { subjects, subjectById, conceptById } from '$lib/science/taxonomy';
	import { emptyFilters, matches, related } from '$lib/science/graph';
	let { data }: { data: PageData } = $props();
	let filters = $state({ ...emptyFilters });
	let selectedId = $state<string | null>(null);
	let mode = $state<'science' | 'materials'>('science');
	let view = $state<'map' | 'list'>('map');
	let limit = $state(12);
	const activities = $derived(data.catalog.map((r) => r.activity));
	const matching = $derived(activities.filter((a) => matches(a, filters)));
	const matchingIds = $derived(new Set(matching.map((a) => a.id)));
	const selected = $derived(activities.find((a) => a.id === selectedId));
	const connections = $derived(selected ? related(selected, matching, mode) : []);
	const selectedSubject = $derived(selected ? subjectById.get(selected.subject) : undefined);
	const activeFilters = $derived(Object.values(filters).some(Boolean));
	const adultLabels = {
		nearby: 'Adult nearby',
		help: 'Adult helps',
		demonstration: 'Adult demonstration'
	};
	const kindLabels = {
		experiment: 'Experiment',
		observation: 'Observation',
		build: 'Build & test'
	};
	async function select(id: string) {
		selectedId = id;
		await tick();
		if (window.matchMedia('(max-width: 900px)').matches)
			document.getElementById('science-detail')?.scrollIntoView({
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'instant'
					: 'smooth',
				block: 'start'
			});
	}
	function resetFilters() {
		filters = { ...emptyFilters };
		limit = 12;
	}
	async function closeSelection() {
		selectedId = null;
		await tick();
		if (window.matchMedia('(max-width: 900px)').matches)
			document.querySelector('.workspace-toolbar')?.scrollIntoView({ block: 'start' });
	}
	function duration(minutes: number) {
		if (minutes >= 1440)
			return `${Math.round(minutes / 1440)} ${minutes === 1440 ? 'day' : 'days'}`;
		if (minutes >= 60) return `${Math.round((minutes / 60) * 10) / 10} hr`;
		return `${minutes} min`;
	}
</script>

<svelte:head
	><title>Science Constellation · Imaginations By Lai</title><meta
		name="description"
		content="Find a hands-on science activity for ages 5–10. Explore a constellation of connected ideas using everyday materials."
	/></svelte:head
>

<section class="science-page">
	<div class="science-shell">
		<header class="intro">
			<div>
				<p class="eyebrow">LITTLE EXPERIMENTS. BIG CONNECTIONS.</p>
				<h1>A universe of <em>what if?</em></h1>
				<p class="intro-copy">
					Find their next discovery. Follow the science that connects it all.
				</p>
			</div>
			<div class="catalog-note">
				<span>{activities.length}</span> activities to explore<small
					>For curious minds, ages 5–10</small
				>
			</div>
		</header>
		<div class="subject-legend" aria-label="Subjects">
			<button
				class:active={!filters.subject}
				onclick={() => {
					filters.subject = '';
				}}
				aria-pressed={!filters.subject}>All subjects</button
			>
			{#each subjects as subject (subject.id)}<button
					class:active={filters.subject === subject.id}
					onclick={() => {
						filters.subject = filters.subject === subject.id ? '' : subject.id;
					}}
					aria-pressed={filters.subject === subject.id}
					><span class="subject-dot" style:background={subject.color}></span>{subject.label}</button
				>{/each}
		</div>
		<form
			class="filters"
			onsubmit={(event) => event.preventDefault()}
			aria-label="Find an activity"
		>
			<label class="search-field"
				><span>Find a discovery</span><input
					type="search"
					bind:value={filters.query}
					placeholder="Ice, shadows, growing things…"
				/></label
			>
			<label
				><span>Age</span><select bind:value={filters.age}
					><option value="">5–10 years</option>{#each [5, 6, 7, 8, 9, 10] as age (age)}<option
							value={String(age)}>{age} years</option
						>{/each}</select
				></label
			>
			<label
				><span>Where</span><select bind:value={filters.setting}
					><option value="">Anywhere</option><option value="indoor">Indoors</option><option
						value="outdoor">Outdoors</option
					></select
				></label
			>
			<label
				><span>Hands-on time</span><select bind:value={filters.minutes}
					><option value="">Any length</option><option value="15">Up to 15 min</option><option
						value="30">Up to 30 min</option
					><option value="60">Up to an hour</option></select
				></label
			>
			<label
				><span>Your involvement</span><select bind:value={filters.adult}
					><option value="">Any level</option><option value="nearby">Nearby</option><option
						value="help">Helping hands</option
					><option value="demonstration">Demonstration</option></select
				></label
			>
			<label class="material-field"
				><span>Includes materials</span><input
					bind:value={filters.materials}
					placeholder="e.g. paper, water"
				/><small>Comma-separated; other items may be needed.</small></label
			>
		</form>
		<div class="workspace-toolbar">
			<p role="status">
				{matching.length}
				{matching.length === 1 ? 'activity' : 'activities'} match your day{#if activeFilters}<button
						class="clear-filters"
						onclick={resetFilters}>Clear filters</button
					>{/if}
			</p>
			<div class="view-switch" aria-label="Activity view">
				<button
					aria-pressed={view === 'map'}
					onclick={() => {
						view = 'map';
					}}>Constellation</button
				><button
					aria-pressed={view === 'list'}
					onclick={() => {
						view = 'list';
					}}>Activity list</button
				>
			</div>
		</div>
		<div class="workspace">
			<div class="explorer" class:map-explorer={view === 'map'}>
				{#if matching.length === 0}<div class="empty-state">
						<span aria-hidden="true">✧</span>
						<h2>A little more room to explore</h2>
						<p>No activities match all those choices. Try fewer materials or a different time.</p>
						<button class="primary-button" onclick={resetFilters}>Show all activities</button>
					</div>
				{:else if view === 'map'}<Constellation
						{activities}
						{matchingIds}
						{selectedId}
						{mode}
						onselect={select}
						onsubject={(id) => {
							filters.subject = id;
						}}
					/>
				{:else}<div class="activity-list" aria-label="Matching activities">
						{#each matching.slice(0, limit) as a (a.id)}<button
								class="activity-card"
								class:chosen={selectedId === a.id}
								onclick={() => select(a.id)}
								aria-pressed={selectedId === a.id}
								><span class="card-subject" style:color={subjectById.get(a.subject)!.color}
									>{subjectById.get(a.subject)!.symbol} {subjectById.get(a.subject)!.label}</span
								><strong>{a.title}</strong><span>{a.question}</span><small
									>{a.activeMinutes} min hands-on · {adultLabels[a.adult]}</small
								></button
							>{/each}{#if matching.length > limit}<button
								class="load-more"
								onclick={() => {
									limit += 24;
								}}>Show more activities ({matching.length - limit} remaining)</button
							>{/if}
					</div>{/if}
				<div class="map-caption">
					<span>✦ Each star is a hands-on discovery.</span><span
						>Connections follow shared ideas, across subjects.</span
					>
				</div>
			</div>
			<aside class="detail-panel" id="science-detail" aria-label="Activity details">
				<p class="sr-only" aria-live="polite">
					{selected ? `Selected: ${selected.title}` : 'Choose an activity to see its details.'}
				</p>
				{#if selected}
					<div class="detail-heading">
						<span class="card-subject" style:color={selectedSubject!.color}
							>{selectedSubject!.symbol} {selectedSubject!.label}</span
						><button
							class="close-detail"
							aria-label="Close activity details"
							onclick={closeSelection}>×</button
						>
					</div>
					<p class="activity-kind">
						{kindLabels[selected.kind]} · Ages {selected.ageMin}–{selected.ageMax}
					</p>
					<h2>{selected.title}</h2>
					<p class="question">{selected.question}</p>
					{#if !matchingIds.has(selected.id)}<p class="filter-notice">
							This selected activity is outside your current filters.
						</p>{/if}
					<div class="activity-facts">
						<span><strong>{selected.activeMinutes} min</strong>hands-on</span><span
							><strong
								>{selected.waitMinutes ? duration(selected.waitMinutes) : 'No waiting'}</strong
							>{selected.waitMinutes ? 'observation window' : 'beyond the activity'}</span
						><span
							><strong>{adultLabels[selected.adult]}</strong>{selected.setting === 'either'
								? 'Indoors or outdoors'
								: selected.setting === 'indoor'
									? 'Indoors'
									: 'Outdoors'}</span
						>
					</div>
					<div class="concept-tags">
						{#each selected.concepts as id (id)}<span>{conceptById.get(id)?.label}</span>{/each}
					</div>
					<h3>Gather a few things</h3>
					<ul class="materials">
						{#each selected.materials as material (material.name)}<li>
								<span>{material.name}</span><small>{material.quantity}</small>
							</li>{/each}
					</ul>
					<div class="parent-note">
						<h3>Before you begin</h3>
						{#each selected.safety as note, index (index)}<p>{note}</p>{/each}
					</div>
					<details class="activity-section">
						<summary>Try this together <span>↗</span></summary>
						<p class="prediction">{selected.prediction}</p>
						<ol>
							{#each selected.steps as step, index (index)}<li>{step}</li>{/each}
						</ol>
						<h4>Look closely</h4>
						<p>{selected.observe}</p>
						<h4>Keep the comparison fair</h4>
						<p>{selected.fairTest}</p>
					</details>
					<details class="activity-section">
						<summary>The science behind it <span>↗</span></summary>
						<p>{selected.explanation}</p>
					</details>
					<details class="activity-section">
						<summary>Make it fit your child <span>↗</span></summary>
						<h4>Ages 5–7{selected.ageMin > 7 ? ' · adult-led introduction' : ''}</h4>
						<p>{selected.younger}</p>
						<h4>Ages 8–10</h4>
						<p>{selected.older}</p>
					</details>
					<div class="related-section">
						<h3>Follow their curiosity</h3>
						<div class="connection-switch" aria-label="Connection type">
							<button
								aria-pressed={mode === 'science'}
								onclick={() => {
									mode = 'science';
								}}>Related science</button
							><button
								aria-pressed={mode === 'materials'}
								onclick={() => {
									mode = 'materials';
								}}>Similar materials</button
							>
						</div>
						{#each connections as connection (connection.activity.id)}<button
								class="related-activity"
								onclick={() => select(connection.activity.id)}
								><span
									class="subject-dot"
									style:background={subjectById.get(connection.activity.subject)!.color}
								></span><span
									><strong>{connection.activity.title}</strong><small>{connection.reason}</small
									></span
								><span aria-hidden="true">↗</span></button
							>{:else}<p class="no-connections">
								No related activities match these filters. Widen your choices to find more
								connections.
							</p>{/each}
					</div>
					{#if selected.sources.length}<details class="activity-section">
							<summary>Background reading</summary>
							<ul>
								{#each selected.sources as source, index (index)}<li>
										<!-- Validated external HTTPS reference, not an app route. -->
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
										<a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
									</li>{/each}
							</ul>
						</details>{/if}
				{:else}
					<div class="welcome-panel">
						<div class="welcome-orbit" aria-hidden="true"><span>✦</span></div>
						<p class="eyebrow">START WITH A LITTLE WONDER</p>
						<h2>One discovery leads<br />to another.</h2>
						<p>
							Choose a star to find an activity, see what you’ll need, and follow its connections.
						</p>
						<div class="suggestion">
							<span>A good place to begin</span><button
								onclick={() => select(matching[0]?.id ?? activities[0]?.id)}
								>Explore {matching[0]?.title.toLowerCase() ?? 'an activity'}
								<span aria-hidden="true">↗</span></button
							>
						</div>
						<p class="parent-hint">
							Designed for you to choose.<br />Made for you to explore together.
						</p>
					</div>
				{/if}
			</aside>
		</div>
		<footer class="science-footer">
			Everyday materials. Extraordinary questions. <span
				>Starter activities are original drafts for parent review; adapt them to your child and
				setting.</span
			>
		</footer>
	</div>
</section>

<style>
	.science-page {
		background: #0a111d;
		color: #e9eff7;
		min-height: calc(100vh - 60px);
		font-family: 'Nunito', sans-serif;
	}
	.science-shell {
		max-width: 1510px;
		margin: auto;
		padding: 48px 40px 26px;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 25px;
		margin-bottom: 32px;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.18em;
		font-weight: 800;
		color: #a8b7c8;
		margin: 0 0 14px;
	}
	h1 {
		font-size: clamp(32px, 3.6vw, 50px);
		line-height: 1.15;
		letter-spacing: -0.045em;
		font-weight: 500;
		margin: 0;
	}
	h1 em {
		font-family: Georgia, serif;
		font-weight: 400;
		color: #b8d1e1;
	}
	.intro-copy {
		margin-top: 14px;
		font-size: 15px;
		color: #a8b7c8;
	}
	.catalog-note {
		border-left: 1px solid #334052;
		padding-left: 22px;
		color: #a7b5c8;
		font-size: 12px;
		white-space: nowrap;
	}
	.catalog-note > span {
		font-size: 25px;
		color: #f1f5fa;
		display: block;
	}
	.catalog-note small {
		display: block;
		margin-top: 7px;
		font-size: 11px;
	}
	.subject-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		margin-bottom: 25px;
	}
	.subject-legend button {
		padding: 9px 12px;
		border: 1px solid transparent;
		border-radius: 9px;
		color: #aebed0;
		font-size: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.subject-legend button:hover,
	.subject-legend button.active {
		background: #1c293b;
		border-color: #344256;
		color: #f1f6fb;
	}
	.subject-dot {
		display: inline-block;
		height: 7px;
		width: 7px;
		flex: 0 0 7px;
		border-radius: 50%;
	}
	.filters {
		display: grid;
		grid-template-columns: 1.6fr 0.7fr 0.8fr 1fr 1.15fr 1.25fr;
		gap: 14px;
		padding: 23px 0;
		border-top: 1px solid #253247;
		border-bottom: 1px solid #253247;
	}
	.filters label {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 11px;
		color: #a9b8c9;
	}
	.filters input,
	.filters select {
		width: 100%;
		min-width: 0;
		height: 41px;
		padding: 10px 12px;
		border: 1px solid #344358;
		border-radius: 9px;
		color: #eff4fa;
		background-color: #111e30;
		font-size: 12px;
		color-scheme: dark;
	}
	.filters select {
		padding-right: 28px;
	}
	.filters input::placeholder {
		color: #93a6bd;
	}
	.material-field small {
		font-size: 10px;
		line-height: 1.4;
	}
	.workspace-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 22px 0 16px;
		gap: 15px;
	}
	.workspace-toolbar p {
		font-size: 12px;
		color: #bdc9d6;
		margin: 0;
	}
	.clear-filters {
		margin-left: 12px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.view-switch,
	.connection-switch {
		display: inline-flex;
		padding: 4px;
		gap: 4px;
		border: 1px solid #314059;
		border-radius: 10px;
	}
	.view-switch button,
	.connection-switch button {
		padding: 7px 12px;
		color: #b1c0d2;
		font-size: 11px;
		border-radius: 6px;
		cursor: pointer;
	}
	.view-switch button[aria-pressed='true'],
	.connection-switch button[aria-pressed='true'] {
		background: #2a3c54;
		color: #f2f6fa;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 355px;
		gap: 22px;
		align-items: start;
	}
	.explorer {
		min-width: 0;
	}
	@media (min-width: 901px) {
		.map-explorer {
			position: sticky;
			top: 20px;
		}
	}
	.detail-panel {
		min-width: 0;
		border: 1px solid #2b394e;
		border-radius: 24px;
		padding: 26px;
		background: #111c2c;
		min-height: 620px;
	}
	.map-caption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		padding: 16px 6px;
		color: #9caec3;
		font-size: 10px;
	}
	.welcome-panel {
		text-align: center;
		padding-top: 50px;
	}
	.welcome-orbit {
		width: 110px;
		height: 110px;
		border: 1px solid #34465d;
		border-radius: 50%;
		margin: 0 auto 35px;
		display: grid;
		place-items: center;
		background: radial-gradient(#456b8b33, transparent 65%);
	}
	.welcome-orbit span {
		font-size: 34px;
		color: #bcd7eb;
	}
	.welcome-panel h2 {
		font-size: 27px;
		line-height: 1.3;
		letter-spacing: -0.03em;
		margin: 15px 0;
	}
	.welcome-panel > p:not(.eyebrow) {
		color: #aab9cb;
		font-size: 13px;
		line-height: 1.8;
	}
	.suggestion {
		margin-top: 30px;
		padding-top: 25px;
		border-top: 1px solid #2d3b50;
		text-align: left;
	}
	.suggestion > span {
		color: #92a7bf;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.suggestion button {
		display: flex;
		gap: 10px;
		justify-content: space-between;
		width: 100%;
		text-align: left;
		font-size: 13px;
		margin-top: 12px;
		color: #d9e6f3;
		cursor: pointer;
	}
	.welcome-panel .parent-hint {
		font-size: 11px !important;
		margin-top: 32px;
		color: #9bafc7 !important;
	}
	.detail-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.card-subject {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.025em;
	}
	.close-detail {
		font-size: 24px;
		color: #afbed0;
		line-height: 1;
		padding: 5px;
		cursor: pointer;
	}
	.activity-kind {
		color: #a8b8cb;
		font-size: 11px;
		margin: 15px 0 10px;
	}
	.detail-panel h2 {
		font-size: 26px;
		line-height: 1.2;
		letter-spacing: -0.025em;
		font-weight: 700;
	}
	.question {
		font-size: 13px;
		color: #bac8d7;
		line-height: 1.7;
		margin-top: 14px;
	}
	.activity-facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 21px 0;
		margin-top: 5px;
		border-bottom: 1px solid #2c3c51;
	}
	.activity-facts span {
		font-size: 10px;
		color: #9caec2;
	}
	.activity-facts strong {
		display: block;
		font-size: 12px;
		color: #e1eaf4;
		font-weight: 700;
		margin-bottom: 5px;
	}
	.concept-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 18px 0 24px;
	}
	.concept-tags span {
		font-size: 10px;
		background: #203048;
		color: #c8d8e9;
		border-radius: 6px;
		padding: 6px 8px;
	}
	h3 {
		font-size: 13px;
		font-weight: 800;
		margin-bottom: 12px;
	}
	.materials {
		margin: 0 0 23px;
		padding: 0;
		list-style: none;
	}
	.materials li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		padding: 7px 0;
		font-size: 12px;
		color: #cbd7e4;
		border-bottom: 1px solid #253449;
	}
	.materials small {
		font-size: 10px;
		color: #a1b3c9;
		text-align: right;
	}
	.parent-note {
		background: #262d35;
		border-left: 2px solid #d4b278;
		padding: 14px;
		border-radius: 0 9px 9px 0;
		margin-bottom: 16px;
	}
	.parent-note h3 {
		font-size: 11px;
		color: #e7cfaa;
		margin-bottom: 7px;
	}
	.parent-note p {
		font-size: 11px;
		line-height: 1.7;
		color: #d4cec3;
	}
	.activity-section {
		border-bottom: 1px solid #2a3b51;
		padding: 16px 0;
	}
	.activity-section summary {
		cursor: pointer;
		font-weight: 700;
		font-size: 12px;
	}
	.activity-section summary span {
		float: right;
		color: #8ba3bf;
	}
	.activity-section p,
	.activity-section li {
		font-size: 12px;
		line-height: 1.8;
		color: #c4d0df;
		margin-top: 12px;
	}
	.activity-section ol {
		list-style: decimal;
		padding-left: 19px;
	}
	.activity-section h4 {
		font-size: 11px;
		font-weight: 800;
		margin-top: 20px;
	}
	.activity-section a {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.related-section {
		margin-top: 25px;
	}
	.connection-switch {
		display: flex;
		margin-bottom: 10px;
	}
	.connection-switch button {
		flex: 1;
		padding: 7px 5px;
	}
	.related-activity {
		display: flex;
		align-items: baseline;
		gap: 10px;
		width: 100%;
		text-align: left;
		padding: 14px 0;
		border-bottom: 1px solid #2b3a4d;
		cursor: pointer;
	}
	.related-activity > span:nth-child(2) {
		flex: 1;
	}
	.related-activity strong {
		display: block;
		font-size: 12px;
		font-weight: 700;
		color: #e0e9f4;
	}
	.related-activity small {
		display: block;
		font-size: 10px;
		line-height: 1.6;
		color: #a6b9ce;
		margin-top: 5px;
	}
	.no-connections,
	.filter-notice {
		color: #d6bd97;
		font-size: 11px;
		line-height: 1.6;
		margin-top: 15px;
	}
	.activity-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 13px;
	}
	.activity-card {
		text-align: left;
		padding: 22px;
		border: 1px solid #2d3b50;
		border-radius: 15px;
		background: #111d2f;
		cursor: pointer;
	}
	.activity-card.chosen {
		border-color: #a9cce5;
	}
	.activity-card strong {
		display: block;
		margin: 15px 0 8px;
		font-size: 17px;
		line-height: 1.3;
	}
	.activity-card > span:not(.card-subject) {
		font-size: 12px;
		line-height: 1.6;
		color: #bccbdc;
		display: block;
	}
	.activity-card small {
		display: block;
		color: #a3b6cc;
		font-size: 10px;
		margin-top: 17px;
	}
	.load-more {
		grid-column: 1 / -1;
		border: 1px solid #3e526f;
		border-radius: 10px;
		padding: 14px;
		cursor: pointer;
		font-size: 12px;
	}
	.empty-state {
		border: 1px solid #2d3b50;
		border-radius: 24px;
		padding: 85px 35px;
		text-align: center;
		min-height: 440px;
	}
	.empty-state > span {
		font-size: 45px;
		color: #b7cfe4;
	}
	.empty-state h2 {
		margin: 15px 0;
		font-size: 24px;
	}
	.empty-state p {
		color: #acbfd3;
		font-size: 14px;
		max-width: 330px;
		margin: 0 auto 25px;
		line-height: 1.7;
	}
	.primary-button {
		background: #c6dfed;
		color: #11233a;
		padding: 12px 19px;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 800;
		cursor: pointer;
	}
	.science-footer {
		color: #91a5bc;
		font-size: 11px;
		padding-top: 25px;
	}
	.science-footer span {
		display: block;
		font-size: 10px;
		margin-top: 7px;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 2px solid #bbdef6;
		outline-offset: 3px;
	}
	@media (max-width: 1200px) {
		.science-shell {
			padding: 35px 25px 25px;
		}
		.filters {
			grid-template-columns: 1.5fr 1fr 1fr;
		}
		.workspace {
			grid-template-columns: minmax(0, 1fr) 320px;
			gap: 15px;
		}
		.detail-panel {
			padding: 22px;
		}
	}
	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.detail-panel {
			min-height: 0;
		}
		.welcome-panel {
			padding: 15px;
		}
		.welcome-orbit {
			display: none;
		}
		.welcome-panel h2 br {
			display: none;
		}
		.suggestion {
			max-width: 350px;
			margin: 20px auto 0;
		}
	}
	@media (max-width: 640px) {
		.science-shell {
			padding: 30px 16px 22px;
		}
		.catalog-note {
			display: none;
		}
		.intro-copy {
			font-size: 13px;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
			gap: 14px 10px;
		}
		.search-field {
			grid-column: 1 / -1;
		}
		.material-field {
			grid-column: 1 / -1;
		}
		.filters input,
		.filters select {
			font-size: 16px;
			height: 45px;
		}
		.workspace-toolbar {
			flex-wrap: wrap;
		}
		.view-switch {
			width: 100%;
		}
		.view-switch button {
			flex: 1;
			min-height: 38px;
		}
		.activity-list {
			grid-template-columns: 1fr;
		}
		.subject-legend {
			gap: 3px;
		}
		.subject-legend button {
			padding: 10px;
			min-height: 44px;
		}
		.related-activity {
			min-height: 54px;
		}
	}
</style>
