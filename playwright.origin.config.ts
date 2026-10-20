import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: 'request-origin.test.ts',
	workers: 1,
	use: { baseURL: 'http://localhost:4177' },
	webServer: {
		command:
			'npm run build && env -u ORIGIN node --import ./e2e/fixtures/math-backend.mjs build/index.js',
		url: 'http://localhost:4177/login',
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			NODE_ENV: 'production',
			MATH_BROWSER_TEST: '1',
			HOST: 'localhost',
			PORT: '4177',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			ADMIN_PASSWORD: 'math-browser-test-password',
			SUPABASE_URL: 'https://math-tests.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'math-browser-test-server-key-never-use-in-production',
			GCS_BUCKET_NAME: 'math-tests-unused-bucket'
		}
	}
});
