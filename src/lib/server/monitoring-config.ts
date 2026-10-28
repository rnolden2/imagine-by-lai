export type MonitoringInput = {
	project: string;
	service: string;
	region: string;
	queue: string;
	notificationChannels: string[];
};

type AlertCondition = {
	name?: string;
	displayName: string;
} & (
	| { conditionMatchedLog: { filter: string }; conditionThreshold?: never }
	| {
			conditionMatchedLog?: never;
			conditionThreshold: {
				filter: string;
				comparison: 'COMPARISON_GT';
				thresholdValue: number;
				duration: string;
				aggregations: { alignmentPeriod: string; perSeriesAligner: 'ALIGN_MAX' }[];
				trigger: { count: number };
				evaluationMissingData: 'EVALUATION_MISSING_DATA_INACTIVE';
			};
	  }
);

export type AlertPolicy = {
	name?: string;
	displayName: string;
	documentation: { content: string; mimeType: 'text/markdown' };
	userLabels: Record<string, string>;
	conditions: AlertCondition[];
	combiner: 'OR';
	enabled: true;
	notificationChannels: string[];
	alertStrategy: { notificationRateLimit?: { period: string }; autoClose: string };
	severity: 'CRITICAL' | 'ERROR' | 'WARNING';
};

/** Preserve server-assigned identities while fully replacing a repository-managed policy. */
export function preparePolicyUpdate(
	current: Pick<AlertPolicy, 'name' | 'conditions'>,
	desired: AlertPolicy
): AlertPolicy {
	if (!current.name) throw new Error('Existing alert policy is missing its resource name.');
	const updated = structuredClone(desired);
	updated.name = current.name;
	if (current.conditions[0]?.name) updated.conditions[0].name = current.conditions[0].name;
	return updated;
}

const identifier = /^[a-z][a-z0-9-]{3,62}$/;
const regionName = /^[a-z]+(?:-[a-z0-9]+)+$/;
const notificationChannel = /^projects\/[A-Za-z0-9._:-]+\/notificationChannels\/[A-Za-z0-9._-]+$/;

function validate(input: MonitoringInput) {
	if (!identifier.test(input.project)) throw new Error('Invalid Google Cloud project ID.');
	if (!identifier.test(input.service)) throw new Error('Invalid Cloud Run service name.');
	if (!identifier.test(input.queue)) throw new Error('Invalid Cloud Tasks queue name.');
	if (!regionName.test(input.region)) throw new Error('Invalid Google Cloud region.');
	if (
		new Set(input.notificationChannels).size !== input.notificationChannels.length ||
		input.notificationChannels.some((channel) => !notificationChannel.test(channel))
	)
		throw new Error('Invalid or duplicate notification channel resource name.');
}

export function buildAlertPolicies(input: MonitoringInput): AlertPolicy[] {
	validate(input);
	const resource = `resource.type="cloud_run_revision"
resource.labels.service_name="${input.service}"
resource.labels.location="${input.region}"`;
	const shared = {
		combiner: 'OR' as const,
		enabled: true as const,
		notificationChannels: [...input.notificationChannels],
		alertStrategy: { autoClose: '1800s' }
	};
	const logShared = {
		...shared,
		alertStrategy: {
			...shared.alertStrategy,
			notificationRateLimit: { period: '300s' }
		}
	};
	return [
		{
			...logShared,
			displayName: 'Imagine: background generation or maintenance failure',
			severity: 'CRITICAL',
			userLabels: { managed_by: 'imagine_repo', policy_key: 'background_failure' },
			documentation: {
				mimeType: 'text/markdown',
				content:
					'Inspect the failed story/Word Kitchen stage, Cloud Tasks delivery, oldest undelivered outbox records, and image-cleanup backlog. Do not retry an uncertain provider result automatically.'
			},
			conditions: [
				{
					displayName: 'Background failure log received',
					conditionMatchedLog: {
						filter: `${resource}
(
  textPayload=~"(story\\.job\\.(stage|dispatch|database)\\.failed|word-kitchen\\.(generation|dispatch|database)|story\\.image\\.(cleanup\\.failed|legacy\\.unresolved)|maintenance\\.failed|ai\\.providers_failed)"
  OR jsonPayload.message=~"(story\\.job\\.(stage|dispatch|database)\\.failed|word-kitchen\\.(generation|dispatch|database)|story\\.image\\.(cleanup\\.failed|legacy\\.unresolved)|maintenance\\.failed|ai\\.providers_failed)"
)`
					}
				}
			]
		},
		{
			...logShared,
			displayName: 'Imagine: readiness unavailable',
			severity: 'ERROR',
			userLabels: { managed_by: 'imagine_repo', policy_key: 'readiness_failure' },
			documentation: {
				mimeType: 'text/markdown',
				content:
					'Inspect the safe readiness code, Secret Manager/runtime identity, worker configuration, and Supabase availability. The public response intentionally omits the cause.'
			},
			conditions: [
				{
					displayName: 'Readiness failure log received',
					conditionMatchedLog: {
						filter: `${resource}
(textPayload:"health.ready.failed" OR jsonPayload.message="health.ready.failed")`
					}
				}
			]
		},
		{
			...logShared,
			displayName: 'Imagine: Cloud Run request failed',
			severity: 'ERROR',
			userLabels: { managed_by: 'imagine_repo', policy_key: 'request_5xx' },
			documentation: {
				mimeType: 'text/markdown',
				content:
					'Inspect Cloud Run request logs by revision and request ID. Pause candidate promotion when failures correlate with the new revision; roll traffic back to the recorded secured revision if needed.'
			},
			conditions: [
				{
					displayName: 'HTTP 5xx request log received',
					conditionMatchedLog: {
						filter: `${resource}
logName="projects/${input.project}/logs/run.googleapis.com%2Frequests"
httpRequest.status>=500`
					}
				}
			]
		},
		{
			...shared,
			displayName: 'Imagine: background task queue is not draining',
			severity: 'ERROR',
			userLabels: { managed_by: 'imagine_repo', policy_key: 'queue_depth' },
			documentation: {
				mimeType: 'text/markdown',
				content:
					'Cloud Tasks has remained nonempty for fifteen minutes. Inspect queue attempt response codes, worker IAM/OIDC, readiness, and undelivered database outbox rows before retrying or promoting a revision.'
			},
			conditions: [
				{
					displayName: 'Queue depth remains above zero',
					conditionThreshold: {
						filter: `resource.type="cloud_tasks_queue" AND resource.labels.project_id="${input.project}" AND resource.labels.location="${input.region}" AND resource.labels.queue_id="${input.queue}" AND metric.type="cloudtasks.googleapis.com/queue/depth"`,
						comparison: 'COMPARISON_GT',
						thresholdValue: 0,
						duration: '900s',
						aggregations: [{ alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_MAX' }],
						trigger: { count: 1 },
						evaluationMissingData: 'EVALUATION_MISSING_DATA_INACTIVE'
					}
				}
			]
		}
	];
}
