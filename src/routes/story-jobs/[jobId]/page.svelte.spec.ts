import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const jobId = '00000000-0000-4000-8000-000000000001';

function job(overrides: Record<string, unknown> = {}) {
	return {
		id: jobId,
		kind: 'create',
		child_id: 1,
		device_id: null,
		target_story_id: null,
		result_story_id: null,
		stage: 'text',
		status: 'running',
		error_code: null,
		created_at: '2026-10-23T00:00:00Z',
		updated_at: '2026-10-23T00:00:01Z',
		...overrides
	};
}

it('announces active progress and offers cancellation without requiring the page to stay open', async () => {
	localStorage.setItem('imagine.pending-story-job', jobId);
	localStorage.setItem('imagine.pending-admin-story-job', jobId);
	await render(Page, {
		props: {
			form: null,
			data: {
				user: undefined,
				gameAvailability: { games: true, kitchen: true, generation: true },
				job: job()
			}
		}
	});
	await expect.element(page.getByRole('heading', { name: 'Writing your story.' })).toBeVisible();
	const progressButton = page.getByRole('button', { name: 'View progress' });
	await expect.element(progressButton).toBeVisible();
	await progressButton.click();
	await expect.element(progressButton).not.toBeInTheDocument();
	await expect.element(page.getByText(/You can leave this page\./)).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Cancel generation' })).toBeVisible();
	expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('story text');
	expect(localStorage.getItem('imagine.pending-story-job')).toBeNull();
	expect(localStorage.getItem('imagine.pending-admin-story-job')).toBeNull();
});

it('shows readable partial success and a story link when illustration generation fails', async () => {
	await render(Page, {
		props: {
			form: null,
			data: {
				user: undefined,
				gameAvailability: { games: true, kitchen: true, generation: true },
				job: job({
					status: 'partial',
					stage: 'image',
					result_story_id: 42,
					error_code: 'PROVIDER_FAILED'
				})
			}
		}
	});
	await expect
		.element(
			page.getByRole('heading', { name: 'Your story is ready to read without a new illustration.' })
		)
		.toBeVisible();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('The story provider could not complete this request.');
	await expect
		.element(page.getByRole('link', { name: 'Read the story →' }))
		.toHaveAttribute('href', '/story/42');
	await expect
		.element(page.getByRole('button', { name: 'Cancel generation' }))
		.not.toBeInTheDocument();
});
