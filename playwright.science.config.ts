import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: 'science.test.ts',
	workers: 1,
	use: {
		baseURL: 'http://localhost:4178',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		browserName: 'chromium',
		channel:
			process.env.PLAYWRIGHT_CHANNEL ??
			(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
				? 'chrome'
				: undefined),
		headless: true,
		viewport: { width: 1440, height: 1100 }
	},
	webServer: {
		command:
			process.env.SCIENCE_SKIP_BUILD === '1'
				? 'node build/index.js'
				: 'npm run build && node build/index.js',
		url: 'http://localhost:4178/science',
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			HOST: 'localhost',
			PORT: '4178',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			SCIENCE_CATALOG_SOURCE: 'bundled',
			ADMIN_PASSWORD: 'science-browser-fixture',
			SUPABASE_URL: 'https://science-fixture.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'science-fixture-key-unused-for-bundled-science',
			GCS_BUCKET_NAME: 'science-fixture-unused'
		}
	}
});
