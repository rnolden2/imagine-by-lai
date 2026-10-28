# Imagine by Lai

I created this personal project for my daughter to help her complete her daily 10-minute reading goal for school. I wanted her to use her imagination to create stories she would love to read and see herself in those stories. The app now includes personalized storybooks, math practice, and spelling practice.

## Features

### Storybooks and reading

- Generate illustrated stories from a child's idea, with a positive life lesson.
- Personalize stories with a child's name, grade, character description, and preferred themes. Profiles support TK through 8th grade and target reading times of 3, 5, 8, or 10 minutes.
- Read stories with large text and a reading guide. Click words for phonetic spelling and a simple definition, with spoken assistance.
- Generate cover illustrations and store them in Google Cloud Storage. Stories can still be saved when image generation fails, with image recovery available in settings.

### Math and spelling

- Practice addition, subtraction, multiplication, division, fractions, telling time, and number recognition.
- Configure math modes and difficulty for each child, including number ranges, fraction denominators, and clock intervals.
- Practice spelling with spoken prompts, built-in grade-based word lists, and custom words.
- Record practice attempts and view session summaries in the parent dashboard.

### Parent dashboard

Sign in at `/login` with the configured admin password to access `/settings`.
Child profiles, stories, math, and spelling require a parent session or an
authorized device. In Game settings, unlock only the children who use that device;
locking parent settings preserves the device's child access. The science catalog
contains no personal learning data and remains public.

- Create and manage child profiles and story preferences.
- Configure each child's math practice and manage spelling lists.
- Review practice results and clear practice history.
- Manage stories, regenerate illustrations, assign unused images to stories, and create stories from existing images.
- Delete stories immediately; scheduled maintenance removes unused images safely
  after a one-hour quarantine and preserves images referenced by other stories.

## Architecture

| Component         | Implementation                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| App               | Svelte 5, SvelteKit 2, TypeScript, and Vite 7                            |
| Styling           | Tailwind CSS 4                                                           |
| Server            | SvelteKit server routes and actions, built with `@sveltejs/adapter-node` |
| Database          | Supabase Postgres, accessed server-side with a service-role key          |
| Story text        | OpenAI `gpt-5.1`; Gemini available through the provider setting          |
| Illustrations     | OpenAI `gpt-image-1.5`; Gemini available through the provider setting    |
| Word explanations | OpenAI `gpt-5.1` with structured JSON; Gemini also supported             |
| Speech            | Google Cloud Text-to-Speech, with browser speech synthesis as fallback   |
| Image storage     | Google Cloud Storage with signed read URLs                               |
| Credentials       | Server environment variables or Google Secret Manager                    |
| Parent login      | Admin password with a signed, expiring HTTP-only session cookie          |

The model names above reflect the configuration in [ai.ts](src/lib/server/ai.ts).
API credentials stay on the server. The app uses Supabase for persistence; SQLite
dependencies have been removed and manual SQLite backups are disabled. Use the
database backup and restore procedure verified for the deployed Supabase project.

## Local setup

### Prerequisites

- Node.js 22.17 or newer in the Node 22 series, matching the Docker runtime major version, and npm.
- A hosted Supabase project with the application's existing schema and a server-only service-role key.
- An OpenAI API key in Google Secret Manager for the active text/image provider. Gemini credentials remain supported when switching back to Google AI.
- A Google Cloud project and storage bucket, with credentials for storage, signed URLs, and Cloud Text-to-Speech. Secret Manager access is also needed if credentials are loaded from secrets.

An empty database starts with [supabase/bootstrap.sql](supabase/bootstrap.sql),
followed by every versioned migration in `supabase/migrations` in filename order.
The bootstrap deliberately refuses to run over existing core tables. Existing
installations apply migrations only, after backing up and reviewing the upgrade.
Core authentication also uses the shared rate-limit/device tables, so feature flags
do not make those migrations optional. See the
[release gates](docs/production-readiness.md) and
[migration and image-cleanup procedure](docs/production-operations.md).

### Verify without cloud credentials

```sh
npm run verify:isolated -- --fresh-install --quality --build --unit --browser --database --keep
```

This installs the lockfile in a temporary copy, checks formatting, lint, and types,
and runs the unit, browser, and independent-connection PostgreSQL suites against
isolated fixtures. It excludes local environment files and credential files and
does not inherit the shell's environment.
On macOS it uses an installed Google Chrome; elsewhere add `--install-browser` to
install Playwright Chromium into the temporary workspace. Linux browser system
dependencies must be installed separately, as shown in the CI workflow.
Omit `--fresh-install` to reuse the installed dependencies. `--keep` retains logs
and browser artifacts in the printed temporary workspace.

With PostgreSQL 16 or 17 installed locally, add `--database` to also run the story
concurrency checks, or run `npm run test:db:stories` on its own. These checks create
a disposable cluster under `/tmp` with a private Unix socket and no TCP listener.
They use independent database connections, stop the cluster afterward, and never
connect to an existing database. The CI workflow includes this check on Ubuntu 24.04.

Passing these checks does not verify live provider access, production migrations,
backups, or deployment permissions. The [readiness ledger](docs/production-readiness.md)
records remaining work; production readiness has not been established.

### Install and configure

```sh
npm ci
cp .env.example .env
```

Edit `.env` with your own values:

| Variable                    | Purpose                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`            | Parent dashboard password; use a long, random value. Changing it invalidates existing admin sessions. |
| `SUPABASE_URL`              | Hosted project URL in the form `https://YOUR_PROJECT.supabase.co`.                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Private database credential used only by the server.                                                  |
| `OPENAI_API_KEY`            | Optional direct override for the OpenAI key; leave unset to use Secret Manager.                       |
| `GEMINI_API_KEY`            | Optional direct override used when `AI_PROVIDER=gemini`.                                              |
| `GCS_PROJECT_ID`            | Google Cloud project used for Secret Manager lookups.                                                 |
| `GCS_BUCKET_NAME`           | Bucket for story illustrations.                                                                       |

Direct API keys and Supabase values take precedence over Secret Manager. To use Secret Manager for a value, omit its direct environment variable instead of leaving the example placeholder. Secret names can be overridden with:

| Variable                                | Default secret name         |
| --------------------------------------- | --------------------------- |
| `OPENAI_API_KEY_SECRET_NAME`            | `openAI_api_key`            |
| `GEMINI_API_KEY_SECRET_NAME`            | `gemini_api`                |
| `SUPABASE_URL_SECRET_NAME`              | `supabase_url`              |
| `SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME` | `SUPABASE_SERVICE_ROLE_KEY` |

`ADMIN_PASSWORD` is read directly from the runtime environment. Secret names are case-sensitive; the default OpenAI secret is `openAI_api_key`, matching the existing Cloud Run configuration. A deployment can inject that secret into `OPENAI_API_KEY`, or the server can retrieve it through Secret Manager. No local API key is required when Secret Manager access is configured.

Google Cloud clients use Application Default Credentials. For local development with the Google Cloud CLI installed:

```sh
gcloud auth application-default login
```

The credential identity must have access to the configured services and bucket, including the ability to sign image URLs. API keys alone do not configure Cloud Storage or Cloud Text-to-Speech access.

### AI provider selection

`AI_PROVIDER=openai` is the default for story text, cover generation/regeneration, stories created from images, and word explanations. If an OpenAI request fails, the app makes one Gemini fallback attempt. This covers story text and illustrations, word definitions, and kitchen recipe plans and artwork. Explicit model safety refusals are not retried through another provider. Set `AI_PROVIDER=gemini` to use Gemini directly; restart the server or deploy a new revision after changing configuration.

| Variable             | Default         | Purpose                                                                       |
| -------------------- | --------------- | ----------------------------------------------------------------------------- |
| `AI_PROVIDER`        | `openai`        | Select `openai` or `gemini` for text and images.                              |
| `OPENAI_TEXT_MODEL`  | `gpt-5.1`       | OpenAI Responses API model for stories, image understanding, and definitions. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1.5` | GPT Image model for 1024×1024 PNG illustrations at medium quality.            |

Gemini mode uses `gemini-2.5-pro` for text/definitions and `gemini-2.5-flash-image`
for illustrations. With OpenAI selected, a failed request can use the single Gemini
fallback described above. OpenAI requests use bounded timeouts and no automatic
SDK retries. Image failures retain the existing story-recovery behavior.

The OpenAI SDK and Secret Manager key integration are shared across these operations. See the [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation) for API requirements. Google Cloud Storage and Cloud Text-to-Speech remain in use. Word Kitchen reserves a separate allowance before each Gemini fallback and records the actual image provider in asset provenance. If both providers fail, the job stops with `AI_PROVIDERS_FAILED`. Provider attempts share an overall timeout: OpenAI gets half, and Gemini gets the remaining time. A timed-out primary request may still be billed.

### Run

```sh
npm run dev -- --open
```

Vite normally serves the app at `http://localhost:5173`. Use `/login` to unlock the parent dashboard and create child profiles. Math and spelling are available at `/math` and `/spelling`.

To build and preview locally:

```sh
npm run build
npm run preview
```

The production Node entry point is `build/index.js`. With Node 22, you can explicitly load local environment values when running it:

```sh
node --env-file=.env build/index.js
```

## Tests and checks

Install Chromium for browser-based unit and end-to-end tests:

```sh
npx playwright install chromium
```

| Command                                       | Purpose                                                           |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `npm run lint`                                | Check formatting and run ESLint.                                  |
| `npm run test:unit -- --run`                  | Run Vitest server and browser tests once.                         |
| `npm run test:unit -- --run --project=server` | Run only Node-based unit tests.                                   |
| `npm run test:e2e`                            | Build and preview the app, then run the default Playwright suite. |
| `npm run test:e2e:math`                       | Run the isolated math-settings regression suite.                  |
| `npm test`                                    | Run unit tests followed by the default end-to-end suite.          |

The named end-to-end suites use isolated fixture backends and test credentials;
none access live Supabase. They verify production builds but do not establish a
deployed database's schema, IAM, or service permissions. See the
[math regression test guide](e2e/README.md) for details and the installed-Chrome
option.

## Deployment

The [Dockerfile](Dockerfile) builds with the npm lockfile on the same pinned Node
22 patch release used by deployment verification, prunes development dependencies,
runs as the unprivileged `node` user, and starts `build/index.js` on port 3000. The
hosted readiness workflow also runs the image with a read-only filesystem, dropped
Linux capabilities, bounded resources, and a `/health/live` smoke check.

The workspace also includes Cloud Run deployment configuration. See the [deployment guide](deploy/README.md) for required secrets, runtime permissions, configuration validation, and Skaffold commands. Review its project, service, bucket, and region values for your own environment before deploying.

`docker compose up --build` is a local-only production-image smoke path. It binds
to loopback, loads runtime configuration from the local `.env` file, and runs with
a read-only filesystem, dropped capabilities, and no obsolete SQLite mounts. Do
not use Compose for deployment. The supported release path is the gated Cloud
Build zero-traffic candidate described in the deployment guide.

## Science Constellation

The parent-facing `/science` page connects 148 starter activities for ages 5–10 in a subject-colored constellation. Filter by age, setting, time, supervision, and materials; select an activity to read its instructions and explore related science. See the [science catalog guide](science/README.md) for the resumable AI expansion script targeting 1,000 activities, human review workflow, and optional Supabase import.

```sh
npm run science:catalog -- expand --target 1000
npm run test:science
```

The expansion command previews its plan; add `--run` with `OPENAI_API_KEY` configured to generate drafts. The bundled catalog works without applying the new database migration.

## Word Kitchen

Word Kitchen adds a recipe library under `/games`, with Fruit Salad, Pancakes,
and Pizza at three play lengths. Children practice current grade/custom spelling
words while selecting ingredients, measuring, mixing, spelling, and decorating.
Published recipes are shared with every chef. Recipe grade bands are shown as
guidance, while each child's food preferences and practice words still apply.
Apply `supabase/migrations/20261020053133_shared_recipes_word_kitchen.sql` before
deploying shared recipe access; existing published recipes need no reassignment.
Cooking steps animate the matching action, including slicing, whisking, pouring,
and sprinkling, with keyboard controls and reduced-motion support.
Progress, assistance, and one completion reward are saved transactionally; a lost
response can be retried without duplicate points. Twenty starter assets are bundled.

Parents manage food preferences, device access, favorite foods, generation jobs,
recipe previews/approval, immutable revisions, and learning evidence at
`/settings/games`. New AI content is generated by an authenticated Cloud Tasks
worker and stays private until the parent approves its exact revision for the shared library. OpenAI is
the default provider; Gemini remains selectable with `AI_PROVIDER=gemini`.

Games remain disabled until their migration and seed are installed. Paid generation
has its own flag, provider-credit requirement, and reserved spending limits. See
[Word Kitchen installation, operations, and verification](docs/word-kitchen-operations.md)
for the deployment sequence, required credentials, retention, and release checks.

```sh
npm run check
npm run test:db:kitchen
npm run test:e2e:kitchen
npm run kitchen:assets
# With private database credentials and the migration installed:
npm run kitchen:seed
```

The isolated kitchen test suite uses disposable PostgreSQL and test credentials;
it does not read or mutate the live Supabase database.
