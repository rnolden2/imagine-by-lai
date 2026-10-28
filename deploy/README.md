# Cloud Run deployment

## Workspace project and quota defaults

Opening this folder in VS Code applies project `api-project-371618` and quota
project `api-project-371618` to **new integrated terminals**, with region
`us-central1`. Close/reopen existing terminals after changing workspace settings.
These environment overrides do not rewrite global gcloud configuration or shared
Application Default Credentials. They apply to the workspace terminal, not to
other editor windows; manually changing directories within that terminal keeps
the same overrides.

From any terminal, use the project commands to guarantee the correct defaults:

```sh
npm run cloud -- config list --format=json
npm run deploy
npm run kitchen:infrastructure          # preview only
npm run kitchen:infrastructure -- --apply
```

`npm run deploy` submits `cloudbuild.yaml`, which builds an image tagged with the
immutable Cloud Build ID and deploys a `candidate` revision with **zero traffic**.
The VS Code **Cloud: deploy Imagine** task runs the same command. Deployment only
starts when requested; opening the workspace does not deploy anything, and a
successful build does not promote production traffic. Apply
pending Supabase migrations separately before deploying dependent application
changes. The kitchen recovery migration must precede the fifteen-minute schedule.
Apply `supabase/migrations/20261002190844_admin_daily_limit_word_kitchen.sql`
before deploying the admin daily-allowance controls; they require its server-only
quota RPCs.

Cloud Build performs a frozen dependency install, dependency audit, repository
lint, Svelte/TypeScript check, and the complete isolated Node/server test project
before it builds or pushes an image. It deliberately does not start a browser in
the slim build image. Browser and independent-PostgreSQL suites remain in
the protected hosted readiness workflow; require that workflow before invoking the
deployment or promoting a candidate.

The application image is stored in the regional Artifact Registry repository
`us-central1-docker.pkg.dev/PROJECT/imagine-by-lai`. Container Registry is shut
down; do not change application image paths back to `gcr.io`. Google-owned Cloud
Build builder images with `gcr.io` URLs remain supported.

## Candidate verification and promotion

The candidate has an HTTP startup probe at `/health/ready` and liveness probe at
`/health/live`. Readiness verifies essential non-secret configuration and a bounded
database query; it does not call storage or paid AI providers. Both responses are
generic and non-cacheable. The tagged URL is addressable without receiving normal
traffic. If invocation is IAM-protected, use an authorized identity token for smoke
requests instead of changing the service to public solely for testing.

After migrations and the documented
[database and image-storage recovery rehearsal](../docs/recovery-rehearsal.md), record
the candidate revision and test the tagged URL: anonymous denial, parent login/logout, device scoping and
revocation, one practice-save replay, one story job through every stage, Word
Kitchen generation/recovery, image signing, maintenance, and both health routes.
Review error rate, task age, cleanup backlog, and provider charges before promotion.

Promote gradually by revision tag, observing each step before continuing:

```sh
npm run cloud -- run services update-traffic imagine-by-lai --region=us-central1 --to-tags candidate=5
npm run cloud -- run services update-traffic imagine-by-lai --region=us-central1 --to-tags candidate=25
npm run cloud -- run services update-traffic imagine-by-lai --region=us-central1 --to-tags candidate=100
```

Rollback targets a recorded previously secured revision, never an ambiguous
`latest` image or revision:

```sh
npm run cloud -- run services update-traffic imagine-by-lai --region=us-central1 --to-revisions REVISION_NAME=100
```

Traffic changes are operational actions and were not run during local readiness
work. See Google's [health-check guidance](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
and [gradual rollout procedure](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).

## Monitoring alerts

Preview the four managed alert policies without authentication or writes:

```sh
npm run monitoring:infrastructure
```

The four policies cover background generation/maintenance failures, readiness
failures, Cloud Run 5xx request logs, and a Cloud Tasks queue that remains nonempty
for fifteen minutes. They contain only safe operation names and resource labels.
To apply them, select and test an existing notification channel, then pass
its full resource name explicitly:

```sh
npm run monitoring:infrastructure -- \
  --notification-channel projects/PROJECT/notificationChannels/CHANNEL \
  --apply
```

Apply is idempotent for policies labeled `managed_by=imagine_repo`; it updates only
those managed policies and preserves unrelated policies. It does not create or
guess a notification destination. After applying, generate a controlled test alert,
confirm delivery and recovery/closure, and record the recipient/escalation owner.
Log-based alerts observe only entries written after configuration. See Google's
[log-alert API contract](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts).

Create the ignored local configuration from the tracked placeholder before using
the wrapper:

```sh
cp deploy/google-cloud.env.example deploy/google-cloud.env
```

`deploy/google-cloud.env` accepts only the six non-secret project, quota-project,
and region defaults present in the example. The wrapper rejects additional keys,
including credentials and application secrets. Never stage the local file.
Matching VS Code terminal settings live in `.vscode/settings.json`. Update both if
this project moves.
The wrapper overrides inherited project and quota environment variables for its
child process, leaving your other terminals unchanged. Existing gcloud and ADC
authentication is reused; the signed-in account must have access to this project
and permission to use it as a quota project. If authentication is missing, use
`npm run cloud -- auth login` and `npm run cloud -- auth application-default login`.

For automatic directory-based switching in an external shell, `.envrc` is also
provided for direnv. Direnv is not currently installed on this machine; install it,
enable its shell hook, then run `direnv allow` once in this folder. Without direnv,
the npm commands above still apply all project defaults automatically.

See Google documentation for [environment property overrides](https://docs.cloud.google.com/sdk/docs/properties)
and [quota-project overrides](https://docs.cloud.google.com/docs/quotas/set-quota-project).

## Skaffold alternative (not the production promotion path)

`skaffold.yaml` builds the existing Dockerfile with Google Cloud Build and deploys
the `imagine-by-lai` service in project `api-project-371618`, region `us-central1`.
It explicitly selects the project so your active gcloud project is not used.
The image repository and build service account match `cloudbuild.yaml`.
Skaffold uses `LEGACY` logging (Cloud Logging plus Cloud Storage), because its
v4beta13 JSON schema does not accept `CLOUD_LOGGING_ONLY`. Skaffold sets the build
log bucket to its source staging bucket; the build account needs write access to
that bucket as well as Cloud Logging.

Unlike `cloudbuild.yaml`, `skaffold run` does not enforce the zero-traffic candidate
gate. Use it only for an isolated staging service or manually reproduce the traffic
controls. The documented production path is Cloud Build plus explicit promotion.

Before the first deployment, enable Artifact Registry and create the repository
once if `describe` reports that it is absent:

```sh
npm run cloud -- services enable artifactregistry.googleapis.com
npm run cloud -- artifacts repositories describe imagine-by-lai --location=us-central1
npm run cloud -- artifacts repositories create imagine-by-lai --repository-format=docker --location=us-central1 --description="Imagine by LAI production images"
```

Do not run the create command when `describe` already succeeds. Grant the Cloud
Build service account `roles/artifactregistry.writer` on this repository. Cloud Run
must have `roles/artifactregistry.reader` when its service agent is not already
authorized by same-project defaults. Keep repository administration separate from
the build identity; builds need upload/download access, not repository-creation
permission. The build account must also be able to write logs.
The deploying identity needs Cloud Build and Cloud Run deployment permissions and
permission to act as the build and runtime service accounts. Authenticate with
`gcloud auth application-default login` if application default credentials are not
already configured.

The service references these Secret Manager secrets in the same project:

- `admin_password`: a long, random admin password.
- `supabase_url`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the private server credential.
- `gemini_api`: the Gemini API key, retained for switching providers.
- `openAI_api_key`: the OpenAI API key (case-sensitive, matching the manifest).

Create any missing secrets and grant the Cloud Run runtime service account access
to them. Set `spec.template.spec.serviceAccountName` in `cloud-run-service.yaml`
if using a dedicated runtime identity; otherwise Cloud Run uses its default
runtime identity. That identity also needs access to the configured image bucket
and the Text-to-Speech API. Secret values are injected at runtime.

The `SUPABASE_SERVICE_ROLE_KEY` binding must contain a Supabase server secret
(`sb_secret_...`) or a legacy JWT with the `service_role` role. A publishable/anon
key cannot perform server-only writes or call the kitchen quota RPCs. Keep the
server key in Secret Manager under `SUPABASE_SERVICE_ROLE_KEY`, not in frontend
environment variables.

Do not pin `ORIGIN` to one Cloud Run hostname. The service has multiple valid
addresses; a fixed origin makes login and API writes return 403 on the other
address. The Cloud Build deployment removes stale `ORIGIN` overrides and uses
Cloud Run's Host header with `PROTOCOL_HEADER=x-forwarded-proto`. Same-origin
checks remain enabled. Verify this behavior with
`npx playwright test --config playwright.origin.config.ts`; the tests use an
isolated database fixture and reject cross-site requests on both hostnames.

Review the service name, runtime identity, environment, and traffic settings
against the deployed service before applying this manifest. Existing service IAM
is managed separately; this configuration does not grant public invocation.

Validate and preview without deploying:

```sh
skaffold diagnose --yaml-only
skaffold render --offline --digest-source=none --output=/tmp/imagine-cloud-run.yaml
```

Build and deploy:

```sh
skaffold run
```

For a pipeline that builds and deploys in separate stages:

```sh
skaffold build --file-output=/tmp/imagine-build-artifacts.json
skaffold deploy --build-artifacts=/tmp/imagine-build-artifacts.json
```

Skaffold generates its own Cloud Build job and does not execute `cloudbuild.yaml`.
See the [Skaffold Cloud Build documentation](https://skaffold.dev/docs/builders/build-environments/cloud-build/)
and [Cloud Run deployer documentation](https://skaffold.dev/docs/deployers/cloudrun/).

Text and image generation default to OpenAI (`AI_PROVIDER=openai`). The existing
OpenAI secret is injected as `OPENAI_API_KEY`; no local key file is required. Set
`AI_PROVIDER=gemini` and deploy a new revision to switch back. Optional model
overrides are `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL`; see the root README.
