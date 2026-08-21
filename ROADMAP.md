# Roadmap: closing the gap to the target architecture

The delta between the code today and [`ARCHITECTURE.md`](ARCHITECTURE.md). Each item names the
principle it satisfies, the evidence that it is missing, and the concepts to read up on. No
implementations: the shape and the reasoning are here, the code is yours.

**Item IDs are stable labels, not an ordering.** The table is ordered by value per unit of effort; the
sections that follow are in ID order so links stay put as priorities change.

**Baseline.** Measured against the `roadmap` branch, not `main`. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for why.

**Evidence.** Every claim was reproduced against the running code rather than read off a commit
message or a doc. `npm ci`, `npm run lint` (clean), `npm run build` (clean), `npm test` (**29 files,
156 tests, all passing**), plus throwaway probes for the cache leak, the type-generation path, and the
bundle measurement, all deleted afterwards. Where something is a latent risk rather than a live
defect, it says so.

## Relationship to the other roadmaps

This is **not** a second parallel roadmap, and it deliberately does not renumber anything.

[`SPEC.md`](SPEC.md) carries the **build** roadmap: numbered steps 1 to 12, the MVP port, complete,
plus a short "Deferred" list. Those are feature-delivery items. The `F` items below are
architecture-hardening items, a different axis. Where the two touch, the overlap is called out
explicitly rather than silently duplicated:

| `SPEC.md` deferred item | Status here |
|---|---|
| "the `npm run gen:api` script" | Landed on `roadmap`, but **broken**. Repaired by [F2](#f2-repair-type-generation-and-check-it-in-ci). |
| "MSW not adopted (tests mock `fetch`)" | Still true, and defensible. [F4](#f4-test-against-the-real-contract) argues contract testing is the better spend. |
| "a Playwright e2e smoke" | Still open. Noted in [F4](#f4-test-against-the-real-contract), not claimed as new. |
| "deploy config" | Partly landed (`.env.example`, `firebase.json`). The missing CI deploy step is [F8](#f8-harden-ci-and-add-a-bundle-budget). |
| "optimistic mutations" | **Not covered here.** A UX refinement, not an architectural gap. It stays `SPEC.md`'s. |
| "`Army_Read.created_at` awaits a backend field" | **Stale, delete it.** The backend ships `created_at` and it is present in the generated schema. See [F9](#f9-clear-the-doc-and-dead-code-drift). |

[`CODE-REVIEW.md`](CODE-REVIEW.md) tracks correctness bugs. Its findings are referenced where a
structural cause sits underneath one, not restated. Note that its claim about `Army_Read.created_at`
being missing is also wrong, for the same reason.

| Order | # | Item | Satisfies | Effort |
|---|---|---|---|---|
| 1 | [F1](#f1-clear-the-query-cache-on-sign-out) | Clear the query cache on sign-out | §3, §4 | Trivial |
| 2 | [F2](#f2-repair-type-generation-and-check-it-in-ci) | Repair type generation, check it in CI | §2.3 | Small |
| 3 | [F7](#f7-lock-in-the-accessibility-work-with-a-linter) | Lock in the accessibility work | §5 | Trivial |
| 4 | [F6](#f6-return-users-to-the-page-they-asked-for) | Return users to the page they asked for | §4 | Trivial |
| 5 | [F3](#f3-enforce-the-layering-rule-with-lint) | Enforce the layering rule with lint | §1, §2.1 | Small |
| 6 | [F9](#f9-clear-the-doc-and-dead-code-drift) | Clear the doc and dead-code drift | §6 | Trivial |
| 7 | [F5](#f5-make-query-keys-consistently-hierarchical) | Make query keys consistently hierarchical | §3 | Small |
| 8 | [F4](#f4-test-against-the-real-contract) | Test against the real contract | §7 | Focused |
| 9 | [F8](#f8-harden-ci-and-add-a-bundle-budget) | Harden CI, add a bundle budget | §8 | Small |
| 10 | [F10](#f10-move-the-owned-filter-to-the-server) | Move the "owned" filter to the server | §9 | Moderate, cross-repo |
| 11 | [F11](#f11-decide-what-zod-is-for) | Decide what zod is for | §2.2 | Decision first |

F10 changes a contract the backend owns. Land both sides together, or the gap becomes a mismatch you
introduced on purpose.

---

## F1. Clear the query cache on sign-out

**Satisfies:** §3 (server state), §4 (session). **Highest severity item on this list.**

**What is missing.** `src/auth/AuthContext.tsx:74-77` is the whole of `logout()`: it clears the token
and sets the user to null. Nothing touches the TanStack Query cache, and grepping `src/auth/` for
`queryClient` or `useQueryClient` returns nothing.

**Why it matters.** The cache outlives the session, so on a shared browser the next person to sign in
sees the previous person's data. TanStack Query serves cached data immediately on mount and refetches
in the background, so this is not a narrow race: it is the **first paint** of every view whose key was
already populated.

Reproduced. Seeding the cache as user A, signing out, then mounting the armies view as user B renders:

```
USER B FIRST PAINT: [{"id":"a1","name":"ULTRAMARINES 2000pt (USER A)"}]
```

User B sees user A's army name on screen before any request completes. If the network is slow or
offline, they keep seeing it.

**Shape of the work.** Sign-out has to end the session completely, which means clearing cached server
state as well as the token. The mechanism is a single call on the `QueryClient`. Two details worth
thinking through rather than copying:

- **Where does it belong?** `logout()` currently lives in a context that has no `QueryClient`
  reference. Wiring one in is straightforward, but consider instead whether "session ended" is an
  event the app should broadcast (the codebase already has this pattern: the 401 listener in
  `src/api/client.ts` decouples the data layer from React). Reusing it keeps auth from needing to know
  about the cache.
- **Clear or reset?** The two `QueryClient` methods differ in whether active queries immediately
  refetch. One of them is right for "the user is leaving", the other for "the user changed". Read what
  each does before picking.

Worth testing, since this is a data-exposure bug and regressions are silent: assert that a key with
data before sign-out has none after.

**Concepts:** `QueryClient.clear()` versus `resetQueries()`; why a cache keyed by resource rather than
by user leaks across sessions; stale-while-revalidate as the reason the stale value is *rendered* and
not merely stored.

---

## F2. Repair type generation and check it in CI

**Satisfies:** §2.3.

**What is missing.** The generated-types story is correct in its result and broken in its mechanism.

The result is right, and this deserves credit before the criticism. `src/api/types.ts` is now a thin
re-export layer over `src/api/schema.d.ts`, with only genuine client-side conveniences hand-defined.
I regenerated `schema.d.ts` from the backend's current `openapi.json` and diffed it against the
committed file: **byte-identical**. The types are in sync right now, and replacing hand-mirrored
types with generated ones was the single biggest correctness improvement on this branch.

Two things break the mechanism:

- **Neither documented regeneration command works.** `package.json:13` points at
  `../warhammer_unit/openapi.json`; the repo is `Warhammer-unit`. `npm run gen:api` exits with a
  file-not-found error, and `make gen-api` fails the same way because it delegates to it. So the
  header comment in `types.ts` ("Do not edit `schema.d.ts` by hand, run `npm run gen:api`") instructs
  the reader to run a command that cannot succeed.
- **Nothing verifies freshness.** When the backend changes a schema, this repo's CI stays green
  against stale types. A checked-in generated file that can drift silently is worse than a
  hand-written one, because everyone trusts it more.

**Shape of the work.** Fix the path, then make staleness a build failure rather than a discovery.

The path question is worth more than a rename, because a filesystem path to a sibling checkout is a
fragile input: it only works if a second repo happens to be cloned next door under an exact name, and
it will never work in CI. Consider what the durable source is. The backend already publishes and
CI-verifies `openapi.json`, so the options are fetching it from a running instance, from the raw file
in the backend repo, or committing it here as a vendored snapshot. Each trades freshness against
build hermeticity; pick deliberately.

The freshness check is the same shape the backend already uses for its own `openapi.json`: regenerate
in CI and fail if the working tree changes. That turns drift from a silent runtime bug into a red build.

While in there: the `ErrorCode` union (`src/api/client.ts:36`) is still hand-mirrored from the
backend's enum. If the backend surfaces those codes in its OpenAPI document, this can be derived
rather than duplicated, which removes the last hand-maintained copy of backend knowledge.

**Concepts:** `openapi-typescript`; generated code as a build artifact versus a committed source file;
`git diff --exit-code` as a staleness gate in CI; hermetic builds.

---

## F3. Enforce the layering rule with lint

**Satisfies:** §1 (layering), §2.1 (one HTTP client).

**What is missing.** The layering rule is followed everywhere and enforced by nothing.

Verified as currently true: exactly one `fetch` call site in non-test source
(`src/api/client.ts:114`), no view or UI component calls `fetch`, and no view imports a resource
module. That is a genuinely clean result.

But `eslint.config.js` extends the recommended presets and adds no import restrictions, so a view
could import `apiGet`, or call `fetch`, or read `localStorage` directly, and lint, build, and all 156
tests would stay green. `SPEC.md` states these rules in prose. Prose does not fail a build.

**Why now.** The rule is currently unbroken, which is exactly when this is cheap. Adding enforcement to
a codebase that already complies takes one config change and zero refactoring. Adding it after three
violations have accumulated means fixing them first, and by then the rule has already stopped being
true.

**Shape of the work.** ESLint can express "files in this directory may not import from that one".
Two mechanisms worth comparing: the built-in `no-restricted-imports` with path patterns, which is
zero extra dependencies and adequate for a handful of rules, or `eslint-plugin-boundaries`, which
models layers as first-class elements and scales better once there are more than a few. Start with the
rules that matter: `src/views/` and `src/ui/` may not import `src/api/client`, and nothing outside
`src/api/client.ts` may reference `fetch` or `localStorage`.

The backend solved the identical problem with a layered import contract that runs in CI, and it is
worth reading how that is configured, because the concept transfers exactly even though the tool
differs.

**Concepts:** ESLint `no-restricted-imports` zones; `eslint-plugin-boundaries`; architecture fitness
functions, the general name for a test that asserts a structural property rather than a behavioural one.

---

## F4. Test against the real contract

**Satisfies:** §7 (testing).

**What is missing.** The suite is good and its blind spot is structural, not a matter of coverage.

Stubbing `fetch` and asserting on the wire format is the right call, and better than mocking the
modules under test: it proves the app sends the request it claims to send. 29 files and 156 tests
spread evenly across the client, resource modules, query layer, auth, routing, UI kit, and views.

The blind spot: **a stub answers whatever the test author expected.** A suite that mocks `fetch` can
be entirely green against a contract the real backend does not honour, because both the code and its
test encode the same wrong assumption.

That is not hypothetical here. It is exactly how `CODE-REVIEW.md`'s headline bug survived: the catalog
requested a page size the API rejects, every test stubbed a 200 response, and the real API answered
422 while the UI rendered a plausible-looking zero for every faction. Nothing in the suite could have
caught it, because nothing in the suite had ever seen the real contract.

**Shape of the work.** The generated schema (F2) is half the answer: once request and response types
come from the backend's own document, a wrong field name stops compiling. The other half is checking
the parts types cannot express, such as which query parameter values the API actually accepts.

Options, roughly in increasing order of cost and confidence:

- **Type the stubs from the generated schema**, so a fixture that does not match the real response
  shape fails the typecheck. Cheapest, and it composes with the tests already written.
- **Contract tests driven by the OpenAPI document**, asserting each resource function builds a
  request the schema declares to be valid.
- **A small end-to-end smoke test** against a real backend instance, covering sign-in and one read
  path. `SPEC.md` already lists a Playwright smoke as deferred, so this is that item, not a new one.

MSW is the usual suggestion here and it is worth understanding, but be clear about what it buys: it
moves *where* the stub lives, not whether it is a stub. It would not have caught the bug above. Prefer
spending the effort on the contract.

Separately, there is no coverage threshold, so a new module can ship untested without any signal.

**Concepts:** consumer-driven contract testing; OpenAPI request and response validation; the
distinction between mocking a module, stubbing a transport, and testing a contract.

---

## F5. Make query keys consistently hierarchical

**Satisfies:** §3 (server state).

**What is missing.** The key factory (`src/api/queries.ts:39`) mixes two conventions:

- `armies` is `['armies']` and `army(id)` is `['army', id]` (`:41-42`). Different first segments, so
  they are **siblings, not parent and child**.
- `unitFacets` is `['units', 'facets', filters]` (`:46`), genuinely nested under the units namespace.

The consequence of the first: invalidating the prefix `['army']` does not match `['armies']`. I
checked the prefix-matching semantics directly rather than assuming. That is why every army mutation
invalidates two keys by hand, and why one inventory mutation reaches for the broad `['army']` prefix
(`:208`) while separately naming the inventory key.

It works today. The cost is that correctness depends on remembering to list every affected key at
every mutation, so the failure mode is a stale view after some future mutation, which is the kind of
bug that gets reported as "sometimes it doesn't update".

**Shape of the work.** Pick one convention and apply it. A hierarchy where the list and the detail
share a root (so a detail key is a strict extension of the list key) lets a single prefix invalidation
cover a resource and everything beneath it, which is what TanStack Query's prefix matching is designed
for. This is a rename plus deleting the now-redundant second invalidation at each call site.

Worth reading the "query key factory" pattern as commonly written up, since it also covers typing the
factory so a key cannot be constructed ad hoc at a call site.

**Concepts:** TanStack Query partial key matching and `exact`; query key factory patterns; cache
invalidation granularity, and why over-invalidating is a performance problem while under-invalidating
is a correctness one.

---

## F6. Return users to the page they asked for

**Satisfies:** §4 (session).

**What is missing.** `src/auth/RequireAuth.tsx:20` redirects with `<Navigate to="/login" replace />`
and carries no record of where the user was going, so the attempted URL is lost. Someone opening a
shared link to a specific army while signed out signs in and lands on the home view.

**Shape of the work.** React Router can carry state through a redirect, and the sign-in flow reads it
back after a successful authentication and navigates there instead of to a fixed default. The hook
that exposes the current location is the input; the `state` option on the redirect is the carrier.

One security detail worth knowing, because it is a real vulnerability class and not a hypothetical:
only ever redirect to an **internal path**. If the destination can come from user-controllable input
such as a query string, validate that it is a relative path before navigating, or you have built an
open redirect that a phisher can point at their own domain. Carrying it in router state rather than a
query parameter avoids most of this, which is a good reason to prefer it.

**Concepts:** `useLocation` and `Navigate` state in React Router; the post-login redirect pattern;
open redirect vulnerabilities.

---

## F7. Lock in the accessibility work with a linter

**Satisfies:** §5 (presentation and accessibility).

**What is missing.** The accessibility work in this codebase is real and better than most projects at
this stage: 33 `aria-label` attributes, `aria-pressed` on toggles, `aria-busy` on async regions,
`aria-invalid` on fields, `aria-modal` plus a focus trap and focus restoration on the modal, and
`role="status"` and `role="alert"` live regions. That is deliberate work.

It is also entirely convention. `eslint-plugin-jsx-a11y` appears in neither `package.json` nor
`eslint.config.js`, so nothing stops the next component from shipping a click handler on a `div` with
no keyboard equivalent, an image with no alt text, or a form control with no label.

**Why this is the best value on the list after F1 and F2.** It costs one dependency and one config
line, requires no refactoring because the code already complies, and it converts work already done
into a property that stays true. That is the whole "convention versus guarantee" distinction in a
single change.

Expect the first run to surface a couple of genuine findings. Read them rather than suppressing them.

**Concepts:** `eslint-plugin-jsx-a11y`; WCAG 2.2 AA as the usual target; the limits of static analysis
for accessibility, which is that a linter catches missing semantics but never catches a bad focus
order or an unusable flow, so it is a floor and not a ceiling.

---

## F8. Harden CI and add a bundle budget

**Satisfies:** §8 (build and CI).

**What is missing.** The pipeline is the right shape and ahead of the codebases this project is
measured against. `.github/workflows/ci.yml` runs `npm ci`, lint, `npm run build` (which is
`tsc -b && vite build`, so the typecheck gates too), and the tests, on every push and pull request.
Both reference repos have no CI at all.

Four gaps:

- **No bundle budget**, and it has already cost something measurable. Adding zod moved the main chunk
  from **270.38 kB to 330.38 kB** (86.00 kB to 102.01 kB gzipped). I built both branches to measure
  rather than estimating. That may be a fine trade (see F11), but it should be a decision someone
  made, not a number nobody watched.
- **No `concurrency` group**, so pushing three times to an open PR runs three full pipelines and the
  first two are worthless.
- **No coverage reporting**, so nothing signals when a module ships untested.
- **No deploy step**, despite `firebase.json` being committed. Deploys are manual, which means the
  deployed artifact is not necessarily one that passed CI.

**Shape of the work.** The concurrency group and coverage are configuration. The bundle budget needs a
decision about what the limit is and where it is enforced: Vite can warn on chunk size, and there are
dedicated size-checking actions that fail a PR on a regression against the base branch, which is the
version that actually catches things. The deploy step should run only after the checks pass, and only
on the default branch.

**Concepts:** GitHub Actions `concurrency` and `cancel-in-progress`; performance budgets; Vite
`build.chunkSizeWarningLimit` and `rollupOptions.output.manualChunks`; deploying from CI so that only
tested artifacts reach production.

---

## F9. Clear the doc and dead-code drift

**Satisfies:** §6 (docs).

Small, individually trivial, and worth doing in one pass because each item is a place where a reader
is actively misled.

**Docs that describe code that no longer exists:**

- `README.md:24` says the dev server proxies `/auth`, `/me`, `/units`, `/factions`. `vite.config.ts`
  proxies `/api`. The README was rewritten on this branch and this line survived the rewrite.
- `README.md:83` and `package.json:13` both point at `../warhammer_unit`. The repo is
  `Warhammer-unit`. This is what makes F2's command fail.
- `SPEC.md:158` and `:164` list `ToastContext.tsx` and `factionFlavor.ts` in the project structure.
  Neither exists. The same listing omits `src/lib/errors.ts`, `src/api/schema.d.ts`,
  `src/toast/toastBus.ts`, and `src/ui/ErrorBoundary.tsx`, all of which do.
- `SPEC.md`'s deferred list says `Army_Read.created_at` "awaits a backend field". The backend ships it
  and it is present in the generated schema. `CODE-REVIEW.md` makes the same wrong claim.
  Both should be struck rather than carried forward, since a stale open item costs someone a
  re-investigation.

**Code that no longer has a purpose:**

- `apiGetWithHeaders` (`src/api/client.ts:157`) has **zero call sites** outside its own test. It
  existed to read the `X-Total-Count` header, which the backend removed when the total moved into the
  response body. Its doc comment still advertises that header, as does the header comment on
  `src/views/CatalogView.tsx:8`, whose code now correctly reads the body total.
- Four exported query hooks have no call sites: `useMe` (`src/api/queries.ts:56`), `useUpdateArmy`
  (`:133`), `useDeleteArmy` (`:146`), `useSetArmyUnitAmount` (`:180`). They have tests, which makes
  them look load-bearing to anyone reading quickly.

**The general point**, which is the reason this is a roadmap item and not a chore: unused code that is
tested reads as intentional, and a doc that describes a previous version of the system is worse than
no doc, because it is trusted. Deleting is a feature. If a hook is genuinely planned rather than
abandoned, a comment saying so costs one line and answers the question.

---

## F10. Move the "owned" filter to the server

**Satisfies:** §9 (cross-repo). **Cannot be completed in this repo alone.**

**What is missing.** Filtering and pagination have to happen on the same side. If the server
paginates and the client filters, the filter only ever sees the current page.

The counting half of this was fixed properly on this branch: per-faction counts now come from a
server-side aggregate rather than being derived by downloading the catalog, which is what
`CODE-REVIEW.md` finding 1 asked for. Credit where due, that was the harder half and it was done right.

The filtering half is unchanged. `src/views/CatalogView.tsx:109` narrows the already-paginated page
against the inventory. Three consequences follow:

- The counter at `:183` reads "`visibleUnits.length` of `total`", comparing a filtered page against an
  unfiltered grand total. Those are not the same kind of number.
- An owned unit on page three is invisible while the user is on page one with the filter on.
- A user who owns plenty of models can land on a page where none of them appear and see an empty
  catalog.

The code comment is candid that it "narrows the current page", so this is a known shortcut rather than
an oversight. I checked the backend: `GET /units` accepts `faction_id`, `subfaction_id`, `q`, and
pagination, and exposes no `owned` filter, so this genuinely requires a backend change.

**Shape of the work.** The backend needs a way to restrict the unit list to units the caller owns,
which is a join against the caller's inventory rather than a new endpoint. Then the client passes the
filter as a query parameter instead of filtering the page, and `total` becomes correct by
construction because the same filter feeds both the page and the count.

Land both sides together. A frontend that sends a parameter the backend ignores fails silently, which
is the worst outcome available.

**Concepts:** filter and paginate on the same side, as a general rule; why derived counts must come
from the same query as the data; server-side filtering against a join.

---

## F11. Decide what zod is for

**Satisfies:** §2.2. **The deliverable is a written decision, not necessarily code.**

Zod currently validates exactly one thing: the error response body (`src/api/client.ts:132`). It is
imported in exactly one file. The success path still asserts with `as T` (`:146`).

That asymmetry is the question. Three coherent positions, and the point is to hold one on purpose:

1. **Errors only, as now.** Defensible: error bodies are the least predictable thing the API returns,
   they are the shape most likely to arrive from an intermediary rather than the app, and a wrong
   guess there produces user-visible nonsense. But it is a runtime dependency earning its keep at one
   call site, and it moved the main chunk from 270.38 kB to 330.38 kB (86.00 kB to 102.01 kB
   gzipped), measured across both branches.
2. **Validate success payloads too.** Consistent, and it closes §2.2 properly. The cost is a second
   schema to maintain beside the generated types, and the risk is real: two sources of truth for the
   same shape drift, and then validation rejects data the API legitimately sent. If you go this way,
   generate the schemas from OpenAPI rather than hand-writing them, so there is still one source.
3. **Drop zod, hand-roll a type guard for the error body.** A narrow guard is a few lines, has no
   bundle cost, and gives the same safety at this one boundary. It gives up the ergonomics if
   validation later spreads.

There is no single right answer, and this is genuinely a judgement call rather than a gap. What is
not fine is the current situation being **undecided**: a dependency in the bundle whose scope nobody
has chosen, which is how bundles grow without anyone being responsible.

Note that the generated types (F2) already handle the *shape* question at compile time for well-behaved
responses. Runtime validation defends against the API not matching its own schema, which is a real but
narrower risk. Weigh it as such.

**Concepts:** parse, don't validate; runtime validation versus static types and what each actually
guarantees; `zod-to-openapi` and OpenAPI-to-zod generators; bundle cost per dependency.
