# Cloud Run deployment

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
- `supabase_service_role_key`: the private server credential.
- `gemini_api`: the Gemini API key, retained for switching providers.
- `openAI_api_key`: the OpenAI API key (case-sensitive, matching the manifest).

Create any missing secrets and grant the Cloud Run runtime service account access
to them. Set `spec.template.spec.serviceAccountName` in `cloud-run-service.yaml`
if using a dedicated runtime identity; otherwise Cloud Run uses its default
runtime identity. That identity also needs access to the configured image bucket
and the Text-to-Speech API. Secret values are injected at runtime.

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
