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

`npm run deploy` submits `cloudbuild.yaml`, which builds and deploys the service.
The VS Code **Cloud: deploy Imagine** task runs the same command. Deployment only
starts when requested; opening the workspace does not deploy anything. Apply
pending Supabase migrations separately before deploying dependent application
changes. The kitchen recovery migration must precede the five-hour schedule.
Apply `supabase/migrations/20261002190844_admin_daily_limit_word_kitchen.sql`
before deploying the admin daily-allowance controls; they require its server-only
quota RPCs.

`deploy/google-cloud.env` contains the non-secret command defaults; matching VS Code
terminal settings live in `.vscode/settings.json`. Update both if this project moves.
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

## Skaffold alternative

`skaffold.yaml` builds the existing Dockerfile with Google Cloud Build and deploys
the `imagine-by-lai` service in project `api-project-371618`, region `us-central1`.
It explicitly selects the project so your active gcloud project is not used.
The image repository and build service account match `cloudbuild.yaml`.
Skaffold uses `LEGACY` logging (Cloud Logging plus Cloud Storage), because its
v4beta13 JSON schema does not accept `CLOUD_LOGGING_ONLY`. Skaffold sets the build
log bucket to its source staging bucket; the build account needs write access to
that bucket as well as Cloud Logging.

Before the first deployment, ensure the existing `gcr.io` repository is available
through Artifact Registry and the build account can push images and write logs.
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
