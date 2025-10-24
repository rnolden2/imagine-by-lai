
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// GCS credentials are still needed for image uploads
export const GCS_BUCKET_NAME = 'api-project-371618.appspot.com';
export const GCS_PROJECT_ID = 'api-project-371618';
export const ADMIN_PASSWORD = '1111';

// Name of the secret in Google Secret Manager
const GEMINI_API_KEY_SECRET_NAME = "gemini_api";

let geminiApiKey: string | undefined;

/**
 * Fetches the Gemini API key from Google Secret Manager.
 * Caches the key in memory after the first fetch.
 */
export async function getGeminiApiKey(): Promise<string> {
	if (geminiApiKey) {
		return geminiApiKey;
	}

	if (!GCS_PROJECT_ID || !GEMINI_API_KEY_SECRET_NAME) {
		throw new Error('Missing GCS_PROJECT_ID or GEMINI_API_KEY_SECRET_NAME env variables.');
	}

	const client = new SecretManagerServiceClient();

	try {
		const [version] = await client.accessSecretVersion({
			name: `projects/${GCS_PROJECT_ID}/secrets/${GEMINI_API_KEY_SECRET_NAME}/versions/latest`
		});

		const payload = version.payload?.data?.toString();
		if (!payload) {
			throw new Error('Secret payload is empty.');
		}

		geminiApiKey = payload;
		return geminiApiKey;
	} catch (error) {
		console.error('Failed to fetch secret from Secret Manager:', error);
		throw new Error('Could not retrieve Gemini API key.');
	}
}
