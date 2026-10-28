import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { env } from '#lib/server/runtime-config';

const DEFAULT_GCP_PROJECT_ID = 'api-project-371618';
const secretCache = new Map<string, string>();
const pendingSecrets = new Map<string, Promise<string>>();
let secretClient: SecretManagerServiceClient | undefined;

export const GCS_BUCKET_NAME = env.GCS_BUCKET_NAME ?? 'api-project-371618.appspot.com';
export const GCS_PROJECT_ID =
	env.GCS_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? DEFAULT_GCP_PROJECT_ID;
export const ADMIN_PASSWORD = env.ADMIN_PASSWORD ?? '';

const OPENAI_API_KEY_SECRET_NAME = env.OPENAI_API_KEY_SECRET_NAME ?? 'openAI_api_key';
const GEMINI_API_KEY_SECRET_NAME = env.GEMINI_API_KEY_SECRET_NAME ?? 'gemini_api';
const SUPABASE_URL_SECRET_NAME = env.SUPABASE_URL_SECRET_NAME ?? 'supabase_url';
const SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME =
	env.SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME ?? 'SUPABASE_SERVICE_ROLE_KEY';

async function getSecretValue(secretName: string): Promise<string> {
	const cached = secretCache.get(secretName);
	if (cached) return cached;
	let pending = pendingSecrets.get(secretName);
	if (!pending) {
		pending = loadSecretValue(secretName).finally(() => pendingSecrets.delete(secretName));
		pendingSecrets.set(secretName, pending);
	}
	return pending;
}

async function loadSecretValue(secretName: string): Promise<string> {
	if (!GCS_PROJECT_ID) {
		throw new Error('Missing GCP project ID for Secret Manager access.');
	}

	secretClient ??= new SecretManagerServiceClient();
	const [version] = await secretClient.accessSecretVersion(
		{
			name: `projects/${GCS_PROJECT_ID}/secrets/${secretName}/versions/latest`
		},
		{ timeout: 5000, retry: null }
	);
	const payload = version.payload?.data?.toString();

	if (!payload) {
		throw new Error(`Secret ${secretName} payload is empty.`);
	}

	secretCache.set(secretName, payload);
	return payload;
}

async function getConfiguredSecret(
	directValue: string | undefined,
	secretName: string
): Promise<string> {
	if (directValue) return directValue;
	return getSecretValue(secretName);
}

export async function getOpenAIApiKey(): Promise<string> {
	return getConfiguredSecret(env.OPENAI_API_KEY, OPENAI_API_KEY_SECRET_NAME);
}

export async function getGeminiApiKey(): Promise<string> {
	return getConfiguredSecret(env.GEMINI_API_KEY, GEMINI_API_KEY_SECRET_NAME);
}

export async function getSupabaseUrl(): Promise<string> {
	return getConfiguredSecret(env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL, SUPABASE_URL_SECRET_NAME);
}

export async function getSupabaseServiceRoleKey(): Promise<string> {
	const directServerKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
	if (directServerKey) return directServerKey;

	return getConfiguredSecret(undefined, SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME);
}
