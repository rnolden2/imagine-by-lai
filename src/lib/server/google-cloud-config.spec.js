import { describe, expect, it } from 'vitest';
import {
	GOOGLE_CLOUD_CONFIG_KEYS,
	parseGoogleCloudConfig
} from '../../../scripts/google-cloud-config.mjs';

const validSource = GOOGLE_CLOUD_CONFIG_KEYS.map((key) => `${key}=example-value`).join('\n');

describe('Google Cloud command configuration', () => {
	it('accepts only the documented non-secret defaults', () => {
		expect(Object.keys(parseGoogleCloudConfig(validSource)).sort()).toEqual(
			[...GOOGLE_CLOUD_CONFIG_KEYS].sort()
		);
	});

	it('rejects unsupported keys, including credential-shaped keys', () => {
		expect(() =>
			parseGoogleCloudConfig(`${validSource}\nGOOGLE_APPLICATION_CREDENTIALS=/tmp/key.json`)
		).toThrow(/unsupported keys: GOOGLE_APPLICATION_CREDENTIALS/);
	});

	it('rejects missing required defaults', () => {
		expect(() => parseGoogleCloudConfig('CLOUDSDK_CORE_PROJECT=example-project')).toThrow(
			/missing required keys/
		);
	});

	it('rejects blank required defaults', () => {
		expect(() =>
			parseGoogleCloudConfig(
				validSource.replace('CLOUDSDK_RUN_REGION=example-value', 'CLOUDSDK_RUN_REGION=')
			)
		).toThrow(/missing required keys: CLOUDSDK_RUN_REGION/);
	});
});
