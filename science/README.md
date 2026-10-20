# Science Constellation

A parent-facing discovery map at `/science`, with 148 original starter activities for ages 5–10 and tools to expand toward 1,000 distinct activities. The starter records are editorial drafts, not a claim of independent educator or safety certification. Their instructions, limitations, and adult involvement are visible to parents.

## Experience

Six stable colors identify physics, chemistry, biology, Earth/environment, space, and engineering. Selecting a star opens its materials, active time, waiting period, age guidance, precautions, instructions, explanation, and related activities. Shared concepts connect activities across subjects; a separate material mode answers “what else can we do with these things?” Broad skills such as measurement alone do not create a science connection.

Parents can filter by subject, age, location, active time, adult involvement, words, and materials. Comma-separated material terms mean the activity **includes all those materials**, not that those are the only items needed. Every activity lists its complete supplies. The activity list is a keyboard-friendly alternative to the zoomable, pannable map.

The graph uses responsive SVG lines and native HTML buttons, avoiding a new graphics dependency. The initial catalog is bundled so the page works before a database migration is deployed. The full catalog can instead load from Supabase server-side, with explicit pagination.

## Catalog contracts

- `src/lib/science/taxonomy.ts`: subject colors and controlled scientific concepts.
- `src/lib/science/starter.ts`: the 148 starter records: 26 each in physics and chemistry, and 24 each in biology, Earth/environment, space, and engineering.
- `src/lib/science/contracts.ts`: strict shared validation for app, AI output, and imports.
- `src/lib/science/graph.ts`: filters, weighted concept connections, and stable map layout.
- `scripts/science/catalog.mjs`: generation, validation, review, export, and database import.

Experiments, observations, and engineering builds are explicitly distinguished. Two age adaptations stay on one record rather than inflating the count. Material names and concept IDs should stay consistent. Add new concepts to the controlled taxonomy deliberately, then update tests and import the taxonomy again.

## AI expansion script

Use Node 22.19 or newer and the project's installed dependencies. Commands work from the repository root. API keys are read from the environment, never accepted as command-line values or written to checkpoints. `--model` overrides `SCIENCE_AI_MODEL`, then `OPENAI_TEXT_MODEL`, then the existing app's `gpt-5.1` default. This script uses the OpenAI Responses API with strict structured output; it has no browsing tool.

Inspect the plan without API calls or writes:

```sh
npm run science:catalog -- validate
npm run science:catalog -- expand --target 1000
```

With `OPENAI_API_KEY` already set in your environment, generate a bounded batch of paid API drafts:

```sh
npm run science:catalog -- expand --target 1000 --batch-size 5 --max-batches 10 --run
```

The target includes the 148 starters plus existing non-rejected generated records. The command above makes **at most 10 calls** in that invocation, then checkpoints and exits. Repeat it to resume. To allow enough attempts to approach 1,000 in a single run, explicitly increase `--max-batches` (for example, `220`). Duplicate/invalid results can mean more attempts are needed. A target of 1,000 drafts does not mean 1,000 reviewed activities.

Default files, excluded from Git:

| File                                         | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `science-work/catalog.json`                  | Generated records and subsequent review decisions; starters remain in source |
| `science-work/catalog.json.usage.jsonl`      | Provider response IDs, model, and token usage for completed batches          |
| `science-work/catalog.json.rejections.jsonl` | Rejected candidates and validation/duplicate reasons                         |
| `science-work/catalog.json.lock`             | Prevents simultaneous generation/review writes                               |

Generation is sequential, has no automatic API retries, and has a 180-second request timeout. It stops on incomplete/refused responses and on a batch with no valid new activities. Each successful batch is saved by atomic file replacement. If interrupted, rerun with the same file; existing IDs/titles/questions inform deduplication. A timed-out or interrupted call can still be billed even if no checkpoint was saved. Usage logging is not a billing ledger. Remove a stale `.lock` file only after verifying that its owning process has stopped.

Exact ID/title/question duplicates and strongly overlapping title/question wording are rejected. Semantic duplicates can still pass; originality review is necessary. The script does not fetch model-proposed URLs and does not claim that schema validation establishes scientific accuracy or safety.

## Human review and publication

Generated activities are always `draft`, with model/response/time/prompt provenance. The model cannot supply publication or review fields. Read each activity, check its sources, question, explanation, practical execution, supervision, age suitability, and distinctness. Edit the draft JSON as needed, including at least one genuine, checked scientific reference in `activity.sources`. This is an editorial operation; an AI should not record a human review that did not occur.

Preview a review decision, then add `--run` to save it:

```sh
npm run science:catalog -- review --id ACTIVITY_ID --reviewer 'Reviewer name' --notes 'Describe the checks actually performed and any corrections.'
```

Reviews include a SHA-256 hash of the exact activity. Changing reviewed content invalidates publication until it is reviewed again. To re-review an edited record, explicitly set its status back to `draft` and its review to `null`, then repeat review. Existing reviewed database rows are immutable through the importer: create a new version with a new ID, or manage an intentional replacement separately.

```sh
npm run science:catalog -- validate
npm run science:catalog -- export
```

Export creates `science-work/published.json` containing starters and valid reviewed records only. It is a distributable snapshot; `--file` on the catalog tool always refers to the **generated-records checkpoint**, not this combined export. Keep a backup of checkpoints and review history appropriate to your publishing workflow.

## Supabase persistence

Migration: `supabase/migrations/20261018224806_science_catalog.sql`.

It adds subjects, concepts, experiments, and experiment/concept links, with foreign keys and lookup indexes. All four tables enable RLS, revoke client-role access, and allow the existing server role to manage data. No public write endpoint or privileged SQL function is added. No child-specific data is stored in this catalog.

1. Apply the migration through your normal reviewed database migration process to the intended environment.
2. Set `SCIENCE_DATABASE_URL` to that environment's PostgreSQL connection URL, with TLS configured for remote access. This is used only by the CLI importer; it is not a browser variable.
3. Preview, then import:

```sh
npm run science:catalog -- import
npm run science:catalog -- import --run
```

The importer uses a transaction and is repeatable. It imports the 148 starters plus valid reviewed additions, synchronizes concept edges, excludes drafts, and refuses to replace different already-reviewed content. It never applies migrations itself. Authentication failures, missing tables, invalid records, or conflicts roll back the whole import.

4. Set `SCIENCE_CATALOG_SOURCE=database` for the SvelteKit server and restart/deploy it. It uses the existing server-side Supabase credentials. An unset value or `bundled` uses the 148 starters. Invalid mode values and database errors fail visibly; the app does not silently substitute the bundled catalog in database mode.

Local implementation does not apply migrations or deploy changes to the hosted application automatically.

## Validation

```sh
npm run test:science
npm run check
npm run build
npm run test:e2e:science
```

The script tests use mocked generation and embedded PostgreSQL; they make no paid AI calls or live database writes. Browser tests run the built app with fake environment settings and bundled catalog mode, and block external browser requests. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome when needed.

The 1,000-node layout fixture checks geometry/determinism, not real-device frame rates. Test a representative full catalog on your target tablets before increasing publication volume. Starter references are included where verified; the catalog has no independent reviewer. Add further sources and review through an editorial process when required.
