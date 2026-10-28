import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('production deployment configuration', () => {
	let dockerfile: string;
	let dockerignore: string;
	let gitignore: string;
	let cloudConfigExample: string;
	let cloudWrapper: string;
	let workflow: string;
	let cloudbuild: string;
	let skaffold: string;
	let cloudRunService: string;
	let deploymentReadme: string;
	let recoveryRunbook: string;

	beforeAll(async () => {
		[
			dockerfile,
			dockerignore,
			gitignore,
			cloudConfigExample,
			cloudWrapper,
			workflow,
			cloudbuild,
			skaffold,
			cloudRunService,
			deploymentReadme,
			recoveryRunbook
		] = await Promise.all([
			readFile('Dockerfile', 'utf8'),
			readFile('.dockerignore', 'utf8'),
			readFile('.gitignore', 'utf8'),
			readFile('deploy/google-cloud.env.example', 'utf8'),
			readFile('scripts/with-google-cloud.mjs', 'utf8'),
			readFile('.github/workflows/production-readiness.yml', 'utf8'),
			readFile('cloudbuild.yaml', 'utf8'),
			readFile('skaffold.yaml', 'utf8'),
			readFile('deploy/cloud-run-service.yaml', 'utf8'),
			readFile('deploy/README.md', 'utf8'),
			readFile('docs/recovery-rehearsal.md', 'utf8')
		]);
	});

	it('builds a locked production image that runs as a non-root user', () => {
		expect(dockerfile).toContain('node:22.19.0-alpine');
		expect(dockerfile).toContain('COPY package.json package-lock.json ./');
		expect(dockerfile).toContain('npm ci --omit=dev --ignore-scripts --no-audit --no-fund');
		expect(dockerfile).toContain('npm run build && npm run check:bundle');
		expect(dockerfile).toMatch(/\nUSER node\s*\n/);
		expect(dockerfile).toContain("fetch('http://127.0.0.1:3000/health/live')");
		expect(dockerfile).toContain('CMD [ "node", "build/index.js" ]');
	});

	it('excludes credentials and local environment files from the image context', () => {
		for (const entry of [
			'**/.env',
			'**/.env.*',
			'**/*service-account*.json',
			'src/lib/server/api-project.json',
			'static/word-kitchen/*/master.png',
			'static/word-kitchen/*/provider-master.png',
			'.git',
			'.codex'
		])
			expect(dockerignore.split(/\r?\n/)).toContain(entry);
	});

	it('keeps local cloud defaults untracked and rejects secret-bearing keys', () => {
		const gitignoreLines = gitignore.split(/\r?\n/);
		expect(gitignoreLines).toContain('deploy/*');
		expect(gitignoreLines).toContain('!deploy/google-cloud.env.example');
		expect(gitignoreLines).not.toContain('!deploy/google-cloud.env');
		expect(gitignoreLines).toContain('src/lib/server/api-project.json');
		expect(gitignoreLines).not.toContain('static/robots.txt');
		expect(gitignoreLines).not.toContain('skaffold.yaml');

		const configuredKeys = cloudConfigExample
			.split(/\r?\n/)
			.filter(Boolean)
			.map((line) => line.split('=', 1)[0]);
		expect(configuredKeys).toEqual([
			'CLOUDSDK_CORE_PROJECT',
			'CLOUDSDK_BILLING_QUOTA_PROJECT',
			'CLOUDSDK_RUN_REGION',
			'CLOUDSDK_BUILDS_REGION',
			'GOOGLE_CLOUD_PROJECT',
			'GOOGLE_CLOUD_QUOTA_PROJECT'
		]);
		expect(cloudConfigExample).not.toMatch(/SECRET|TOKEN|PASSWORD|PRIVATE_KEY/);
		expect(cloudWrapper).toContain(
			"import { parseGoogleCloudConfig } from './google-cloud-config.mjs'"
		);
	});

	it('pins hosted workflow actions and smoke-tests a restricted container', () => {
		const actions = [...workflow.matchAll(/^\s*- uses:\s*(\S+)/gm)].map((match) => match[1]);
		expect(actions.length).toBeGreaterThanOrEqual(3);
		for (const action of actions) expect(action).toMatch(/@[a-f0-9]{40}$/);
		for (const restriction of [
			'--read-only',
			'--tmpfs /tmp:rw,noexec,nosuid,size=64m',
			'--cap-drop ALL',
			'--security-opt no-new-privileges',
			'--pids-limit 256',
			'--memory 768m',
			'--cpus 1'
		])
			expect(workflow).toContain(restriction);
		expect(workflow).toContain('= node');
		expect(workflow).toContain('http://127.0.0.1:3000/health/live');
	});

	it('deploys an immutable candidate without changing production traffic', () => {
		const quality = cloudbuild.indexOf("id: 'repository-quality'");
		const serverTests = cloudbuild.indexOf("id: 'isolated-server-verification'");
		const build = cloudbuild.indexOf("id: 'build-image'");
		const push = cloudbuild.indexOf("id: 'push-image'");
		const deploy = cloudbuild.indexOf("id: 'deploy-zero-traffic-candidate'");
		expect(quality).toBeGreaterThanOrEqual(0);
		expect(quality).toBeLessThan(serverTests);
		expect(serverTests).toBeLessThan(build);
		expect(build).toBeLessThan(push);
		expect(push).toBeLessThan(deploy);
		const image =
			'${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/imagine-by-lai:$BUILD_ID';
		expect(cloudbuild.split(image)).toHaveLength(5);
		expect(cloudbuild).not.toContain('gcr.io/$PROJECT_ID');
		expect(cloudbuild).toContain("_ARTIFACT_REPOSITORY: 'imagine-by-lai'");
		expect(cloudbuild).toContain("- '--no-traffic'");
		expect(cloudbuild).toContain("- '--tag=${_CANDIDATE_TAG}'");
		expect(cloudbuild).toContain("- '--remove-env-vars=ORIGIN'");
		expect(cloudbuild).toContain('startup-probe=httpGet.path=/health/ready');
		expect(cloudbuild).toContain('liveness-probe=httpGet.path=/health/live');
		expect(cloudbuild).not.toContain('update-traffic');
	});

	it('uses an explicit regional Artifact Registry repository across deployment paths', () => {
		const image = 'us-central1-docker.pkg.dev/api-project-371618/imagine-by-lai/imagine-by-lai';
		expect(skaffold).toContain(`image: ${image}`);
		expect(cloudRunService).toContain(`image: ${image}`);
		expect(deploymentReadme).toContain('artifacts repositories create imagine-by-lai');
		expect(deploymentReadme).toContain('roles/artifactregistry.writer');
		expect(deploymentReadme).toContain('roles/artifactregistry.reader');
	});

	it('requires an isolated database and storage recovery rehearsal', () => {
		for (const evidence of [
			'recovery point objectives (RPOs)',
			'recovery time objectives (RTOs)',
			'the destination can receive production traffic',
			"'pg_cron', 'pg_net', 'http', 'wrappers', 'vault'",
			"('app_story_provider_attempts')",
			"('game_cost_reservations')",
			'Image-storage rehearsal',
			'database recovery does not restore the private Google Cloud Storage bucket',
			'no external job or production integration ran from the target'
		])
			expect(recoveryRunbook).toContain(evidence);
		expect(deploymentReadme).toContain('../docs/recovery-rehearsal.md');
	});
});
