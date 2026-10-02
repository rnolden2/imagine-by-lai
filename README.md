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

- Create and manage child profiles and story preferences.
- Configure each child's math practice and manage spelling lists.
- Review practice results and clear practice history.
- Manage stories, regenerate illustrations, assign unused images to stories, and create stories from existing images.
- Delete stories and their stored images.

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

The model names above reflect the configuration in [ai.ts](src/lib/server/ai.ts). API credentials stay on the server. The app uses Supabase for persistence; legacy SQLite dependencies and Docker Compose volume mounts remain in the repository, but SQLite is no longer the application's database and manual SQLite backups are disabled.

## Local setup

### Prerequisites

- Node.js 22.12 or newer in the Node 22 series, matching the Docker runtime major version, and npm.
- A hosted Supabase project with the application's existing schema and a server-only service-role key.
- An OpenAI API key in Google Secret Manager for the active text/image provider. Gemini credentials remain supported when switching back to Google AI.
- A Google Cloud project and storage bucket, with credentials for storage, signed URLs, and Cloud Text-to-Speech. Secret Manager access is also needed if credentials are loaded from secrets.

The repository does **not** currently include SQL migrations or a database bootstrap command. A new empty Supabase project is not sufficient. The application expects `child_profiles`, `stories`, `lessons`, `math_settings`, `math_attempts`, `spelling_words`, and `spelling_attempts`, including the columns and relationships used by the server queries. [Shared types](src/lib/types.ts) and [server routes](src/routes) describe the expected data, but are not a replacement for the database schema.

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
| `SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME` | `supabase_service_role_key` |

`ADMIN_PASSWORD` is read directly from the runtime environment. Secret names are case-sensitive; the default OpenAI secret is `openAI_api_key`, matching the existing Cloud Run configuration. A deployment can inject that secret into `OPENAI_API_KEY`, or the server can retrieve it through Secret Manager. No local API key is required when Secret Manager access is configured.

Google Cloud clients use Application Default Credentials. For local development with the Google Cloud CLI installed:

```sh
gcloud auth application-default login
```

The credential identity must have access to the configured services and bucket, including the ability to sign image URLs. API keys alone do not configure Cloud Storage or Cloud Text-to-Speech access.

### AI provider selection

`AI_PROVIDER=openai` is the default for story text, cover generation/regeneration, stories created from images, and word explanations. Gemini remains installed and can be selected with `AI_PROVIDER=gemini`; restart the server or deploy a new revision after changing configuration.

| Variable             | Default         | Purpose                                                                       |
| -------------------- | --------------- | ----------------------------------------------------------------------------- |
| `AI_PROVIDER`        | `openai`        | Select `openai` or `gemini` for text and images.                              |
| `OPENAI_TEXT_MODEL`  | `gpt-5.1`       | OpenAI Responses API model for stories, image understanding, and definitions. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1.5` | GPT Image model for 1024×1024 PNG illustrations at medium quality.            |

Gemini mode uses `gemini-2.5-pro` for text/definitions and `gemini-2.5-flash-image` for illustrations. Provider switching is explicit: errors do not silently send requests to the other provider. OpenAI requests use bounded timeouts and no automatic SDK retries. Image failures retain the existing story-recovery behavior.

The OpenAI SDK and Secret Manager key integration are shared across these operations. See the [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation) for API requirements. Google Cloud Storage and Cloud Text-to-Speech remain in use. Word Kitchen is still a proposed feature; its generation workflow is not implemented by this provider switch.

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

The default end-to-end suite uses the app's configured backend. The math-settings suite uses an in-memory backend fixture and test credentials; it does not access live Supabase. It is separate from `npm test` and does not verify a deployed database's schema or permissions. See the [math regression test guide](e2e/README.md) for details and the installed-Chrome option.

## Deployment

The [Dockerfile](Dockerfile) builds a Node 22 production image using Yarn and `yarn.lock`, then starts `build/index.js` on port 3000. Local npm installs use `package-lock.json`; keep both lockfiles aligned when updating dependencies.

The workspace also includes Cloud Run deployment configuration. See the [deployment guide](deploy/README.md) for required secrets, runtime permissions, configuration validation, and Skaffold commands. Review its project, service, bucket, and region values for your own environment before deploying.

`docker-compose.yml` still includes legacy SQLite mounts and does not configure Google Cloud credentials; it needs configuration review before use with the current Supabase-backed app.

## Word Kitchen

Word Kitchen adds a recipe library under `/games`, with Fruit Salad, Pancakes,
and Pizza at three play lengths. Children practice current grade/custom spelling
words while selecting ingredients, measuring, mixing, spelling, and decorating.
Progress, assistance, and one completion reward are saved transactionally; a lost
response can be retried without duplicate points. Twenty starter assets are bundled.

Parents manage food preferences, device access, favorite foods, generation jobs,
recipe previews/approval, immutable revisions, and learning evidence at
`/settings/games`. New AI content is generated by an authenticated Cloud Tasks
worker and stays private until the parent approves its exact revision. OpenAI is
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
