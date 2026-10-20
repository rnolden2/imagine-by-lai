import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'e2e',
	// This suite runs with an isolated backend via playwright.math.config.ts.
	testIgnore: [
		'math-settings.test.ts',
		'space-math.test.ts',
		'request-origin.test.ts',
		'science.test.ts'
	]
});
