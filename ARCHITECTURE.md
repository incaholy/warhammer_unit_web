# Architecture: Warhammer Web

The target architecture for the frontend. This document is **normative**: it states how the app is
meant to be built and why, not how it happens to be built today. [`ROADMAP.md`](ROADMAP.md) carries
the delta between the two.

**Baseline.** Every status below is measured against the `roadmap` branch (the "consume the hardened
API" work), not `main`. That branch is where the repo is heading, and describing `main` would make
this stale the day it merges. Where `roadmap` changed something material, it says so.

**Relationship to the other docs.** [`SPEC.md`](SPEC.md) is the design and feature specification: what
each view does, the design language, the reconciliation with the backend. It also carries the
**build** roadmap (numbered steps 1 to 12, the MVP port). This document is a different axis. It
covers structural decisions and, critically, whether anything **enforces** them. `SPEC.md` states the
layering rules; it does not say that nothing checks them. That gap is what this document exists to
close. [`CODE-REVIEW.md`](CODE-REVIEW.md) covers correctness bugs and is cross-referenced, not
restated.

## How to read this

Every principle below carries a status:

| Status | Meaning |
|---|---|
| **Holds** | True in the code today, and something enforces it. |
| **Partial** | True in places. The exceptions are listed, with a roadmap item. |
| **Not yet** | A decision that has been made but not implemented. Roadmap item given. |
| **Undecided** | Deliberately open. The trade-off is stated so it can be decided rather than drifted into. |

**Those markers are the most important part of this document.** A normative doc that quietly
describes aspirations as facts is worse than no doc, because readers trust it and build against it.

"Something enforces it" in the **Holds** row means a test, a lint rule, a type, a CI step, or a
structural impossibility. **Not discipline.** A rule that depends on everyone remembering it is
**Partial** at best, no matter how consistently it is currently followed. That standard is applied
strictly below, and it is why several sections that describe genuinely good, consistently-applied
code are still marked `Partial`. That is not a criticism of the code. It is a statement about what
would still be true after the next contributor, or the next you, forgets the rule.

**Exactly one principle currently reaches `Holds`** (§2.4), and it is worth studying because it shows
what turning a convention into a guarantee actually costs: one type annotation. Everything else in
this document, including several rules the code follows without a single exception today, is
convention. That ratio is the finding.

---

## 1. Layering

**Views → query hooks → resource functions → HTTP client, in one direction.**

- `src/views/` renders and dispatches intent. A view knows *what* it needs, not *how* it is fetched.
- `src/api/queries.ts` owns server state: query keys, caching, invalidation. One hook per resource
  operation.
- `src/api/<resource>.ts` owns the typed call for each endpoint.
- `src/api/client.ts` owns the base URL, the version prefix, the token, encoding, and error
  normalization.
- `src/ui/` is presentational only, and never fetches.

The payoff is the same one the backend gets from `API → service → DB`: when the transport changes,
one layer changes. The `roadmap` branch is the proof. Moving every route under `/api/v1` touched a
single line (`src/api/client.ts:14`) because nothing else in the app knows a path prefix exists.

**Status: Partial.**

The rule holds in the code today, and I checked rather than assumed: there is **exactly one `fetch`
call site** in non-test source (`src/api/client.ts:114`), no view or UI component calls `fetch`, and
no view imports a resource module directly. The only `src/api/` imports in `src/views/` are types and
the `ApiError` class, which are not data access.

What keeps it from `Holds` is that **nothing enforces it**. ESLint has no import-boundary rule
(`eslint.config.js` extends the recommended presets and nothing else), so a view could import
`apiGet` directly, or call `fetch`, and lint, build, and all 156 tests would stay green.

This is worth comparing to the backend, which had the identical situation and closed it: the layering
rule there is now a machine-checked contract that fails CI when broken. The frontend has a direct
equivalent available. See [ROADMAP F3](ROADMAP.md#f3-enforce-the-layering-rule-with-lint).

---

## 2. The network boundary

Everything crossing the wire is untrusted and versioned. This section is where most of the
architectural weight sits, because it is the seam with another repo that changes independently.

### 2.1 One HTTP client, one place that knows the prefix

A single module owns the base URL, the `/api/v1` prefix, the `Authorization` header, JSON and form
encoding, 204 handling, and turning a non-2xx response into a typed `ApiError`. Nothing else reads
the token or hard-codes a path prefix.

The `tokenStore` object (`src/api/client.ts:19`) is the only code touching `localStorage`, so the
storage decision has exactly one place to change if it ever becomes an httpOnly cookie.

**Status: Partial.** True today, unenforced. Same mechanism and same fix as §1: an import rule that
confines `fetch` and `localStorage` to this module. Rolled into
[ROADMAP F3](ROADMAP.md#f3-enforce-the-layering-rule-with-lint).

### 2.2 Data that crossed the network is validated, not asserted

An `as SomeType` on a parsed response is a claim to the compiler, not a check. `res.json()` returns
`any`, so the assertion is never verified against what actually arrived, and **no compiler flag
catches it**, including `strict`. The only things that catch a shape mismatch are runtime validation
at the boundary or types generated from the real schema.

**Status: Partial.**

The **error** path does this correctly and it is a genuine improvement: `src/api/client.ts:132` parses
the error body with a zod schema via `safeParse`, so a wrong shape degrades to the status-derived
message instead of propagating a lie. The `code` field uses `.catch(undefined)` so an unknown future
error code from the backend degrades gracefully rather than failing the whole parse. That is a
thoughtful detail.

The **success** path still asserts: `src/api/client.ts:146` ends in `(await res.json()) as T`. So the
lesson was applied to the shape that arrives when things go wrong, and not to the shape that arrives
when they go right.

Be careful about the obvious conclusion, though. "Validate every response with zod" is not
automatically correct: it costs bundle size and a second schema to maintain alongside the generated
types. The honest options are narrower, and the trade-off is set out in
[ROADMAP F11](ROADMAP.md#f11-decide-what-zod-is-for).

### 2.3 Types are generated from the backend contract, not hand-mirrored

Hand-maintaining types that mirror another repo's schema is a drift generator, and the drift surfaces
at runtime instead of at compile time. The backend publishes `openapi.json` and verifies its
freshness in its own CI, so the generation input is guaranteed current at the source.

**Status: Partial.**

The generation genuinely happened and the result is genuinely correct. `src/api/schema.d.ts` is
`openapi-typescript` output, and I regenerated it from the backend's current `openapi.json` and
diffed: **byte-identical**. The types are in sync right now.

Two things keep it from `Holds`:

- **The committed regeneration command does not work.** `package.json:13` runs
  `openapi-typescript ../warhammer_unit/openapi.json`, but the backend repo is `Warhammer-unit`, so
  the path does not resolve. Running `npm run gen:api` fails outright. The types are correct because
  they were generated once with a working path, not because the committed script produces them.
- **Nothing verifies freshness.** When the backend changes a schema, this repo's CI stays green
  against stale types. A checked-in generated file that can drift silently is worse than a
  hand-written one, because it is trusted more.

See [ROADMAP F2](ROADMAP.md#f2-repair-type-generation-and-check-it-in-ci).

### 2.4 Errors carry a machine-readable code, and every code has a message

Views branch on a stable `code`, never on HTTP status or on message text. A `code` is a contract; a
message is copy, and copy changes.

**Status: Holds**, for the completeness half, which is the part that is enforced.

`src/lib/errors.ts:10` declares `CODE_MESSAGES` as `Record<ErrorCode, string>`. Because `ErrorCode` is
a union of the known codes, **adding a code to the union without adding a message fails the
typecheck**, and the typecheck runs in CI via `npm run build`. That is a real structural guarantee,
not a convention, and it is the pattern worth copying into the rest of the codebase. It is the reason
this is the only `Holds` in the document.

Two honest caveats that do not change the marker but are worth knowing. The `ErrorCode` union
(`src/api/client.ts:37`) is hand-mirrored from the backend's enum rather than derived from the
generated schema, so it is a second place backend knowledge lives (see F2). And nothing forces a view
to branch on `code` rather than `message`; that half remains convention.

`messageForError` and `fieldErrors` centralize what every view was otherwise repeating, which is the
right shape.

### 2.5 The dev proxy and the deployed origin agree

In dev, Vite proxies the API prefix so the browser sees one origin. In production the app is served
by Firebase Hosting with a rewrite to the API. The prefix the proxy forwards and the prefix the
client sends must be the same string, or dev works and production 404s.

**Status: Partial.** The two agree today: `vite.config.ts` forwards `/api` and `src/api/client.ts:14`
sends `/api/v1`. Half of that is genuinely enforced, since the resource tests assert the exact
outgoing URL (for example `src/api/inventory.test.ts:21` expects `/api/v1/me/inventory`), so changing
the client's prefix breaks the suite.

The **agreement** is not enforced. Nothing reads `vite.config.ts`, and `API_PREFIX` is referenced
only inside `client.ts`, so editing the proxy pattern alone leaves every test green and breaks the
dev server. It is tempting to call this `Holds` on the grounds that a mismatch fails loudly the
moment you load the page, and that argument is worth resisting: fast manual feedback is not
enforcement, it is discipline with a short loop. Something has to actually run for a rule to hold,
and here nothing does.

The cheap fix is a test that reads the proxy config and asserts it is a prefix of `API_PREFIX`, which
is the kind of test that looks pedantic until the day it saves a broken deploy. Folded into
[ROADMAP F4](ROADMAP.md#f4-test-against-the-real-contract).

The README's description of this is stale (see §6).

---

## 3. Server state lives in the query layer

Server state belongs to TanStack Query, never to `useState`. Query keys come from a single factory,
one custom hook per resource operation, and no inline `useQuery` in components. Invalidation is
precise, and mutations that affect the same data share an invalidation helper so they cannot drift
apart.

This is the strongest architectural decision in the repo and it should not be given up. The reference
frontend this project is measured against has **no query library at all**: hand-rolled `useEffect`
plus `useState`, no cache, no deduplication, no invalidation, and failed loads that only reach
`console.error`. That is not a small gap; it is a whole layer.

**Status: Partial.** Three exceptions:

- **The cache is not cleared on sign-out**, which leaks data between accounts on a shared browser.
  This is the highest-severity item in the roadmap and it is reproduced with evidence in
  [ROADMAP F1](ROADMAP.md#f1-clear-the-query-cache-on-sign-out).
- **The key factory mixes two hierarchy conventions.** `armies` is `['armies']` while `army(id)` is
  `['army', id]` (`src/api/queries.ts:41-42`), so they are siblings, not parent and child. Invalidating
  the prefix `['army']` does not touch `['armies']`, which is why every army mutation invalidates both
  keys by hand. Meanwhile `unitFacets` *is* nested under `['units']` (`:46`), so the other convention
  is also present. See [ROADMAP F5](ROADMAP.md#f5-make-query-keys-consistently-hierarchical).
- **Four exported hooks have no call sites**: `useMe` (`:56`), `useUpdateArmy` (`:133`),
  `useDeleteArmy` (`:146`), and `useSetArmyUnitAmount` (`:180`). They are tested, which makes them
  look load-bearing. Covered in [ROADMAP F9](ROADMAP.md#f9-clear-the-doc-and-dead-code-drift).

---

## 4. Session and route protection

The token lives in exactly one module. Sign-out ends the session completely. A guarded route that
bounces an unauthenticated user preserves where they were going, so signing in returns them there.

**Status: Partial.** The token boundary holds (§2.1). Two gaps:

- **Sign-out does not end the session completely.** `src/auth/AuthContext.tsx:74-77` clears the token
  and the user object and stops. Cached server data survives. See
  [ROADMAP F1](ROADMAP.md#f1-clear-the-query-cache-on-sign-out).
- **The attempted URL is discarded.** `src/auth/RequireAuth.tsx:20` redirects with
  `<Navigate to="/login" replace />` and no location state, so a deep link to a specific army lands on
  the home view after signing in. See
  [ROADMAP F6](ROADMAP.md#f6-return-users-to-the-page-they-asked-for).

A detail worth crediting: `RequireAuth` returns `null` while the session is hydrating rather than
redirecting, so a hard refresh does not flash the login screen at an already-authenticated user. That
is a real bug most implementations ship.

---

## 5. Presentation and accessibility

**Styling is CSS Modules over a single token file.** `src/styles/theme.css` is the one source of
colour, type, and spacing values; each component owns a sibling `.module.css`. Ad hoc utility strings
copy-pasted between components are what this avoids, and the reference frontend is exactly that
failure: a zero-config Tailwind install with duplicated utility strings and no token layer.

**Accessibility is part of the component contract, not a later pass.** Interactive components carry
correct roles and ARIA state; modals trap focus and restore it; async regions announce themselves.

**Status: Partial.**

The accessibility work is real and better than most projects at this stage: 33 `aria-label`
attributes, `aria-pressed` on toggles, `aria-busy` on loading regions, `aria-invalid` on fields,
`aria-modal` with a focus trap on the modal, and `role="status"` / `role="alert"` live regions. None
of that is accidental.

But it is entirely convention. There is **no `eslint-plugin-jsx-a11y`**, so the next component can
ship a `<div onClick>` with no keyboard handler and nothing objects. Locking in work already done is
the cheapest possible win. See [ROADMAP F7](ROADMAP.md#f7-lock-in-the-accessibility-work-with-a-linter).

The styling convention has two known exceptions: `src/ui/ErrorBoundary.tsx` and `src/App.tsx` style
with inline objects rather than a module, and nothing prevents a third.

---

## 6. Docs are the contract

- **`README.md` is the front door.** It is the only doc a new reader is guaranteed to open, and it
  links onward.
- **`SPEC.md` is the design and feature spec**, plus the build roadmap.
- **This document is the normative architecture**, and `ROADMAP.md` is the gap list.
- **Docs change in the same PR as the code that changes them.**

**Status: Partial.** The `roadmap` branch rewrote the README into a genuine front door, which was the
right move. Three pieces of drift remain, all introduced by code changes that did not carry their
docs with them:

- `README.md:24` says the dev server proxies `/auth`, `/me`, `/units`, `/factions`. It proxies `/api`.
- `package.json:13`, `README.md:15`, `README.md:54`, `SPEC.md:8`, and `SPEC.md:192` all point at
  `../warhammer_unit`. The repo is `Warhammer-unit`.
- `SPEC.md:158` and `:164` list `ToastContext.tsx` and `factionFlavor.ts`, neither of which exists, and
  the structure listing omits `src/lib/errors.ts`, `src/api/schema.d.ts`, `src/toast/toastBus.ts`, and
  `src/ui/ErrorBoundary.tsx`, all of which do.

See [ROADMAP F9](ROADMAP.md#f9-clear-the-doc-and-dead-code-drift).

---

## 7. Testing strategy

Tests exercise components, hooks, and the client together, and assert on the **wire format** rather
than on a mock's return value. Stubbing at the transport boundary (`fetch`) rather than mocking the
modules under test is deliberate and correct: it means a test proves the app sends the request it
claims to send.

**Status: Partial.** 29 test files and 156 tests pass, covering the client, each resource module, the
query layer, auth, routing, the UI kit, and every view. The distribution is even, which is unusual and
good.

The structural gap is what transport stubbing cannot see. **A stub answers whatever the test author
expected, so a test suite mocking `fetch` can be fully green against a contract the real backend does
not honour.** This is not hypothetical: it is precisely how `CODE-REVIEW.md`'s headline bug survived,
where the client requested a page size the API rejects, the stub happily returned 200, and every
faction silently rendered zero.

The generated schema (§2.3) is the missing half of the answer, and a contract check that runs the
suite against the real OpenAPI document is the other. See
[ROADMAP F4](ROADMAP.md#f4-test-against-the-real-contract).

Also absent: any coverage threshold, and any end-to-end test. `SPEC.md` already lists a Playwright
smoke test as deferred, so that is a known gap rather than an oversight.

---

## 8. Build, CI, and budgets

CI runs lint, type check, build, and tests on every push and pull request. The production bundle has a
size budget, because a dependency added for one call site is easy to add and invisible afterwards.

**Status: Partial.**

The pipeline exists and is the right shape: `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`,
`npm run build` (which is `tsc -b && vite build`, so the typecheck gates too), and `npm test`. Both
reference repos have **no CI at all**, so this is ahead of the codebase this project is measured
against, and it is the reason §2.4's type-level guarantee is worth anything.

Four gaps:

- **No bundle budget**, and it already cost something. Adding zod for the error schema moved the main
  chunk from 270.38 kB to 330.38 kB (86.00 kB to 102.01 kB gzipped). I measured both branches rather
  than estimating. That may well be worth it, but it should be a decision, not a discovery.
- **No `concurrency` group**, so superseded runs keep consuming runner time on every push to an open PR.
- **No coverage reporting**, so there is no signal when a new module ships untested.
- **No deploy step**, despite `firebase.json` being committed, so deploys are manual and unversioned.

See [ROADMAP F8](ROADMAP.md#f8-harden-ci-and-add-a-bundle-budget).

---

## 9. Cross-repo concerns

The frontend and backend are separate repos with a shared contract, and some problems can only be
fixed on one side.

**Filtering and pagination must happen on the same side.** If the server paginates, the server must
filter, or a client-side filter narrows only the current page and every derived count is wrong.

**Status: Partial**, and this is the one architectural rule the codebase gets half right.

The `roadmap` branch fixed the **counting** side properly: per-faction counts now come from a
server-side aggregate endpoint rather than being derived by downloading the catalog, which is what
`CODE-REVIEW.md` finding 1 asked for.

The **filtering** side is unchanged. `src/views/CatalogView.tsx:109` narrows the already-paginated page
against the inventory, so the "N of M" counter at `:183` compares a filtered page against an
unfiltered total, and an owned unit on page three is invisible while filtering page one. The code
comment is candid that it "narrows the current page". This cannot be fixed in this repo alone: I
checked the backend and `GET /units` exposes no `owned` filter. See
[ROADMAP F10](ROADMAP.md#f10-move-the-owned-filter-to-the-server).
