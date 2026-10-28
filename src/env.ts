import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value;

// All values stay runtime-configurable. Validation that depends on combinations of
// variables remains in the readiness and secret-loading boundaries.
export const variables = defineEnvVars({
	GAMES_ENABLED: { schema: optional },
	WORD_KITCHEN_ENABLED: { schema: optional },
	WORD_KITCHEN_GENERATION_ENABLED: { schema: optional },
	ADMIN_PASSWORD: { schema: optional },
	AI_PROVIDER: { schema: optional },
	GCS_BUCKET_NAME: { schema: optional },
	GCS_PROJECT_ID: { schema: optional },
	GOOGLE_CLOUD_PROJECT: { schema: optional },
	OPENAI_API_KEY: { schema: optional },
	OPENAI_API_KEY_SECRET_NAME: { schema: optional },
	OPENAI_IMAGE_MODEL: { schema: optional },
	OPENAI_TEXT_MODEL: { schema: optional },
	GEMINI_API_KEY: { schema: optional },
	GEMINI_API_KEY_SECRET_NAME: { schema: optional },
	SCIENCE_CATALOG_SOURCE: { schema: optional },
	SUPABASE_URL: { schema: optional },
	SUPABASE_URL_SECRET_NAME: { schema: optional },
	SUPABASE_SERVICE_ROLE_KEY: { schema: optional },
	SUPABASE_SECRET_KEY: { schema: optional },
	SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME: { schema: optional },
	WORD_KITCHEN_TASK_QUEUE: { schema: optional },
	WORD_KITCHEN_WORKER_URL: { schema: optional },
	WORD_KITCHEN_WORKER_SERVICE_ACCOUNT: { schema: optional },
	PUBLIC_SUPABASE_URL: { public: true, schema: optional }
});
