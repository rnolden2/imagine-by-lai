import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: 'math-settings.test.ts',
	workers: 1,
	use: {
		baseURL: 'http://localhost:4175',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL,
		headless: true
	},
	webServer: {
		command: 'npm run build && node --import ./e2e/fixtures/math-backend.mjs build/index.js',
		url: 'http://localhost:4175/login',
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			MATH_BROWSER_TEST: '1',
			HOST: 'localhost',
			PORT: '4175',
			ORIGIN: 'http://localhost:4175',
			ADMIN_PASSWORD: 'math-browser-test-password',
			SUPABASE_URL: 'https://math-tests.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'math-browser-test-server-key-never-use-in-production',
			GCS_BUCKET_NAME: 'math-tests-unused-bucket'
		}
	}
});
