import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const modes = [
	{ name: 'games-disabled', port: 4181, flag: 'GAMES_ENABLED' },
	{ name: 'kitchen-disabled', port: 4182, flag: 'WORD_KITCHEN_ENABLED' },
	{ name: 'generation-disabled', port: 4183, flag: 'WORD_KITCHEN_GENERATION_ENABLED' }
];

export default defineConfig({
	testDir: 'e2e',
	testMatch: 'game-availability.test.ts',
	workers: 1,
	use: {
		browserName: 'chromium',
		channel: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
			? 'chrome'
			: undefined,
		headless: true,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	},
	projects: modes.map(({ name, port }) => ({ name, use: { baseURL: `http://localhost:${port}` } })),
	webServer: modes.map(({ port, flag }) => ({
		command: 'node --import ./e2e/fixtures/word-kitchen-backend.mjs build/index.js',
		url: `http://localhost:${port}/login`,
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			WORD_KITCHEN_BROWSER_TEST: '1',
			HOST: 'localhost',
			PORT: String(port),
			PROTOCOL_HEADER: 'x-forwarded-proto',
			ADMIN_PASSWORD: 'kitchen-browser-test-password',
			SUPABASE_URL: 'https://kitchen-tests.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'kitchen-browser-test-server-key-never-use-in-production',
			GAMES_ENABLED: 'true',
			WORD_KITCHEN_ENABLED: 'true',
			WORD_KITCHEN_GENERATION_ENABLED: 'true',
			[flag]: 'false'
		}
	}))
});
