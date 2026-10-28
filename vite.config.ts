import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { existsSync } from 'node:fs';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			preprocess: vitePreprocess(),
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'font-src': ['self'],
					'img-src': ['self', 'https://storage.googleapis.com', 'https://*.storage.googleapis.com'],
					'media-src': [
						'self',
						'blob:',
						'https://storage.googleapis.com',
						'https://*.storage.googleapis.com'
					],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'manifest-src': ['self'],
					'worker-src': ['self', 'blob:'],
					'upgrade-insecure-requests': true
				}
			}
		})
	],
	test: {
		// Embedded Postgres suites are memory-heavy; bound parallel workers in CI.
		maxWorkers: 4,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({
							launchOptions: {
								channel: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
									? 'chrome'
									: undefined
							}
						}),
						instances: [{ browser: 'chromium' }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
