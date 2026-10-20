import { expect, it, vi } from 'vitest';
import { checkResult } from './common';

it('logs a database code and operation without database row contents', () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(() =>
			checkResult(
				{
					data: null,
					error: {
						code: '23503',
						message: 'private row contents',
						details: 'private details'
					}
				},
				'asset_identity.upsert'
			)
		).toThrow();
		expect(log).toHaveBeenCalledWith('word-kitchen.database', {
			failed: true,
			operation: 'asset_identity.upsert',
			code: '23503'
		});
		expect(JSON.stringify(log.mock.calls)).not.toContain('private');
	} finally {
		log.mockRestore();
	}
});

it('does not log arbitrary text passed as a database code', () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(() => checkResult({ data: null, error: { code: 'secret-token-value' } })).toThrow();
		expect(log).toHaveBeenCalledWith('word-kitchen.database', {
			failed: true,
			operation: undefined,
			code: 'UNKNOWN_DATABASE_ERROR'
		});
	} finally {
		log.mockRestore();
	}
});
