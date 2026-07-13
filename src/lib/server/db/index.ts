import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '$lib/server/secrets';
import { SupabaseConnectionError } from './errors';

let supabaseClient: SupabaseClient | null = null;

export { SupabaseConnectionError } from './errors';

function isLikelySupabaseUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
	} catch {
		return false;
	}
}

function describeSupabaseError(operation: string, cause: unknown): string {
	if (cause && typeof cause === 'object') {
		const details = cause as { code?: string; message?: string; hint?: string; details?: string };
		const message = details.message ?? 'Unknown Supabase error';
		const hint = details.hint ? ` Hint: ${details.hint}` : '';
		const code = details.code ? ` (${details.code})` : '';
		return `Supabase ${operation} failed${code}: ${message}.${hint}`;
	}

	if (cause instanceof Error) {
		return `Supabase ${operation} failed: ${cause.message}`;
	}

	return `Supabase ${operation} failed.`;
}

export async function getSupabase(): Promise<SupabaseClient> {
	if (supabaseClient) return supabaseClient;

	try {
		const [url, serviceRoleKey] = await Promise.all([
			getSupabaseUrl(),
			getSupabaseServiceRoleKey()
		]);

		if (!isLikelySupabaseUrl(url)) {
			throw new SupabaseConnectionError(
				'Supabase is misconfigured: SUPABASE_URL must be an https://*.supabase.co URL.'
			);
		}

		if (!serviceRoleKey || serviceRoleKey.length < 40) {
			throw new SupabaseConnectionError(
				'Supabase is misconfigured: set SUPABASE_SERVICE_ROLE_KEY for deployment or PUBLIC_SUPABASE_PUBLISHABLE_KEY for local development.'
			);
		}

		supabaseClient = createClient(url, serviceRoleKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
	} catch (error) {
		if (error instanceof SupabaseConnectionError) throw error;
		throw new SupabaseConnectionError(
			'Supabase is not configured or its deployment secrets could not be loaded.',
			error
		);
	}

	return supabaseClient;
}

export function unwrapSupabase<T>(result: { data: T; error: unknown }): T {
	if (result.error) {
		throw new SupabaseConnectionError(describeSupabaseError('query', result.error), result.error);
	}
	return result.data;
}

export function throwSupabaseError(operation: string, cause: unknown): never {
	throw new SupabaseConnectionError(describeSupabaseError(operation, cause), cause);
}

export function getSupabaseErrorMessage(error: unknown): string {
	if (error instanceof SupabaseConnectionError) return error.publicMessage;
	if (error instanceof Error) return error.message;
	return 'Supabase request failed.';
}
