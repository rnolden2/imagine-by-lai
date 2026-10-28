import { expect, it } from 'vitest';
import { buildAlertPolicies, preparePolicyUpdate } from './monitoring-config';

const input = {
	project: 'fixture-project',
	service: 'imagine-by-lai',
	region: 'us-central1',
	queue: 'word-kitchen',
	notificationChannels: ['projects/123456/notificationChannels/channel-1']
};

it('builds uniquely managed alerts and only applies rate limiting to log policies', () => {
	const policies = buildAlertPolicies(input);
	expect(policies).toHaveLength(4);
	expect(new Set(policies.map((policy) => policy.displayName))).toHaveLength(4);
	expect(new Set(policies.map((policy) => policy.userLabels.policy_key))).toHaveLength(4);
	for (const policy of policies) {
		expect(policy.userLabels.managed_by).toBe('imagine_repo');
		expect(policy.notificationChannels).toEqual(input.notificationChannels);
		expect(policy.alertStrategy.autoClose).toBe('1800s');
		expect(policy.documentation.content.length).toBeGreaterThan(80);
	}
	expect(
		policies
			.slice(0, 3)
			.every((policy) => policy.alertStrategy.notificationRateLimit?.period === '300s')
	).toBe(true);
	expect(policies[3].alertStrategy.notificationRateLimit).toBeUndefined();
	expect(
		policies
			.slice(0, 3)
			.every((policy) =>
				policy.conditions[0].conditionMatchedLog?.filter.includes(
					'resource.labels.service_name="imagine-by-lai"'
				)
			)
	).toBe(true);
});

it('covers background failures, readiness, and Cloud Run 5xx requests without personal data', () => {
	const policies = buildAlertPolicies(input);
	const filters = policies
		.flatMap((policy) => policy.conditions[0].conditionMatchedLog?.filter ?? [])
		.join('\n');
	const serialized = JSON.stringify(policies);
	for (const operation of [
		'story\\\\.job',
		'word-kitchen',
		'story\\\\.image',
		'maintenance\\\\.failed',
		'health.ready.failed',
		'httpRequest.status>=500'
	])
		expect(serialized).toContain(operation);
	for (const forbidden of ['prompt', 'child_id', 'content', 'authorization', 'token'])
		expect(filters.toLowerCase()).not.toContain(forbidden);
});

it.each([
	{ ...input, project: '../unsafe' },
	{ ...input, service: 'UPPERCASE' },
	{ ...input, region: 'invalid' },
	{ ...input, queue: 'INVALID' },
	{ ...input, notificationChannels: ['invalid'] },
	{
		...input,
		notificationChannels: [input.notificationChannels[0], input.notificationChannels[0]]
	}
])('rejects malformed identifiers and duplicate channels: %j', (invalid) => {
	expect(() => buildAlertPolicies(invalid)).toThrow();
});

it('preserves API-assigned policy and condition identities during idempotent updates', () => {
	const desired = buildAlertPolicies(input)[0];
	const updated = preparePolicyUpdate(
		{
			name: 'projects/fixture-project/alertPolicies/policy-1',
			conditions: [
				{
					...desired.conditions[0],
					name: 'projects/fixture-project/alertPolicies/policy-1/conditions/condition-1'
				}
			]
		},
		desired
	);
	expect(updated.name).toBe('projects/fixture-project/alertPolicies/policy-1');
	expect(updated.conditions[0].name).toContain('/conditions/condition-1');
	expect(desired.name).toBeUndefined();
	expect(desired.conditions[0].name).toBeUndefined();
});

it('refuses to replace an existing policy without its API resource identity', () => {
	const desired = buildAlertPolicies(input)[0];
	expect(() => preparePolicyUpdate({ conditions: desired.conditions }, desired)).toThrow(
		'missing its resource name'
	);
});

it('alerts when the configured Cloud Tasks queue stays nonempty for a scheduler interval', () => {
	const policy = buildAlertPolicies(input).find(
		(candidate) => candidate.userLabels.policy_key === 'queue_depth'
	)!;
	const threshold = policy.conditions[0].conditionThreshold!;
	expect(threshold.filter).toContain('metric.type="cloudtasks.googleapis.com/queue/depth"');
	expect(threshold.filter).toContain('resource.labels.queue_id="word-kitchen"');
	expect(threshold).toMatchObject({ thresholdValue: 0, duration: '900s' });
});
