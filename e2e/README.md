# Math settings regression tests

Run `npm run test:e2e:math` after installing Chromium with
`npx playwright install chromium`. To use an installed Google Chrome instead:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:math
```

The suite builds and runs the production SvelteKit server on localhost:4175.
It exercises admin login, the enhanced settings form, Supabase client requests,
settings reloads, and practice for every operation. It also checks adding modes,
empty selections, isolation between children, and database write failures.

`fixtures/math-backend.mjs` replaces outgoing database requests with an in-memory
fixture for this test process only. All credentials are test values. The suite
does not access live Supabase or verify its schema, constraints, permissions, or
deployment secrets. Those still require a staging deployment check.

This suite uses `playwright.math.config.ts` and is excluded from the default
Playwright configuration so it cannot run against a real database by accident.
