import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const DEFAULT_GCP_PROJECT_ID = 'api-project-371618';
const secretCache = new Map<string, string>();

export const GCS_BUCKET_NAME = privateEnv.GCS_BUCKET_NAME ?? 'api-project-371618.appspot.com';
export const GCS_PROJECT_ID =
	privateEnv.GCS_PROJECT_ID ?? privateEnv.GOOGLE_CLOUD_PROJECT ?? DEFAULT_GCP_PROJECT_ID;
export const ADMIN_PASSWORD = privateEnv.ADMIN_PASSWORD ?? '1111';

const GEMINI_API_KEY_SECRET_NAME = privateEnv.GEMINI_API_KEY_SECRET_NAME ?? 'gemini_api';
const OPENAI_API_KEY_SECRET_NAME = privateEnv.OPENAI_API_KEY_SECRET_NAME ?? 'openai_api_key';
const PUBLIC_SUPABASE_URL = privateEnv.PUBLIC_SUPABASE_URL ?? 'supabase_url';
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
	privateEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'supabase_publishable_key';

async function getSecretValue(secretName: string): Promise<string> {
	const cached = secretCache.get(secretName);
	if (cached) return cached;

	if (!GCS_PROJECT_ID) {
		throw new Error('Missing GCP project ID for Secret Manager access.');
	}

	const client = new SecretManagerServiceClient();
	const [version] = await client.accessSecretVersion({
		name: `projects/${GCS_PROJECT_ID}/secrets/${secretName}/versions/latest`
	});
	const payload = version.payload?.data?.toString();

	if (!payload) {
		throw new Error(`Secret ${secretName} payload is empty.`);
	}

	secretCache.set(secretName, payload);
	return payload;
}

async function getConfiguredSecret(directValue: string | undefined, secretName: string): Promise<string> {
	if (directValue) return directValue;
	return getSecretValue(secretName);
}

export async function getGeminiApiKey(): Promise<string> {
	return getConfiguredSecret(privateEnv.GEMINI_API_KEY, GEMINI_API_KEY_SECRET_NAME);
}

export async function getOpenAIApiKey(): Promise<string> {
	return getConfiguredSecret(privateEnv.OPENAI_API_KEY, OPENAI_API_KEY_SECRET_NAME);
}

export async function getSupabaseUrl(): Promise<string> {
	return getConfiguredSecret(
		privateEnv.SUPABASE_URL ?? publicEnv.PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_URL
	);
}

export async function getSupabaseServiceRoleKey(): Promise<string> {
	const directServerKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? privateEnv.SUPABASE_SECRET_KEY;
	if (directServerKey) return directServerKey;

	const localPublishableKey =
		publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.PUBLIC_SUPABASE_ANON_KEY;
	if (localPublishableKey) return localPublishableKey;

	return getConfiguredSecret(
		undefined,
		PUBLIC_SUPABASE_PUBLISHABLE_KEY
	);
}
