import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	beforeEach(() => localStorage.clear());
	it('should render h1', async () => {
		await render(Page, {
			props: {
				form: null,
				data: {
					user: undefined,
					gameAvailability: { games: true, kitchen: true, generation: true },
					users: [],
					stories: [],
					storyPage: 1,
					hasMoreStories: false,
					storyRequestKey: '00000000-0000-4000-8000-000000000001'
				}
			}
		});

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});

	it('offers recovery when a prior accepted request may have lost its response', async () => {
		localStorage.setItem('imagine.pending-story-job', '00000000-0000-4000-8000-000000000009');
		await render(Page, {
			props: {
				form: null,
				data: {
					user: undefined,
					gameAvailability: { games: true, kitchen: true, generation: true },
					users: [],
					stories: [],
					storyPage: 1,
					hasMoreStories: false,
					storyRequestKey: '00000000-0000-4000-8000-000000000001'
				}
			}
		});

		await expect.element(page.getByRole('button', { name: 'Check that request' })).toBeVisible();
		expect(
			document.querySelector<HTMLInputElement>('form[action="?/recoverStoryJob"] input')?.value
		).toBe('00000000-0000-4000-8000-000000000009');
	});
});
