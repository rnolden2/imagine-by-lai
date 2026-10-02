import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: 'e2e',
	testMatch: 'word-kitchen.test.ts',
	workers: 1,
	timeout: 120000,
	use: {
		baseURL: 'http://localhost:4176',
		browserName: 'chromium',
		channel:
			process.env.PLAYWRIGHT_CHANNEL ??
			(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
				? 'chrome'
				: undefined),
		headless: true,
		trace: 'retain-on-failure'
	},
	webServer: {
		command:
			'npm run build && node --import ./e2e/fixtures/word-kitchen-backend.mjs build/index.js',
		url: 'http://localhost:4176/login',
		timeout: 120000,
		reuseExistingServer: false,
		env: {
			WORD_KITCHEN_BROWSER_TEST: '1',
			HOST: 'localhost',
			PORT: '4176',
			ORIGIN: 'http://localhost:4176',
			ADMIN_PASSWORD: 'kitchen-browser-test-password',
			SUPABASE_URL: 'https://kitchen-tests.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'kitchen-browser-test-server-key-never-use-in-production'
		}
	}
});
