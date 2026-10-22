# Roadmap: closing the gap to the target architecture

The delta between the code today and [`ARCHITECTURE.md`](ARCHITECTURE.md). Each item names the
principle it satisfies, the evidence that it is missing, and the concepts to read up on. No
implementations: the shape and the reasoning are here, the code is yours.

**Item IDs are stable labels, not an ordering.** The table is ordered by value per unit of effort,
with value weighted more heavily than effort, so a `Small` item can outrank a `Trivial` one when it
protects more. The sections that follow are in ID order so links stay put as priorities change.

**Baseline.** The F items were measured against the `roadmap` branch, not `main`; the KF items
against `kill-team-ui`, three slices past it. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for why.

**Evidence.** Every claim was reproduced against the running code rather than read off a commit
message or a doc. `npm ci`, `npm run lint` (clean), `npm run build` (clean), `npm test` (**29 files,
156 tests, all passing** — the figure when the F items were written; it is 46 files and 335 tests
now), plus throwaway probes for the cache leak, the type-generation path, and the
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
| "the `npm run gen:api` script" | Landed on `roadmap`, was **broken**, now repaired — see [F2](#f2-repair-type-generation-and-check-it-in-ci). |
| "MSW not adopted (tests mock `fetch`)" | Still true, and defensible. [F4](#f4-test-against-the-real-contract) argues contract testing is the better spend. |
| "a Playwright e2e smoke" | Still open. Noted in [F4](#f4-test-against-the-real-contract), not claimed as new. |
| "deploy config" | Partly landed (`.env.example`, `firebase.json`). The missing CI deploy step is [F8](#f8-harden-ci-and-add-a-bundle-budget). |
| "optimistic mutations" | **Not covered here.** A UX refinement, not an architectural gap. It stays `SPEC.md`'s. |
| "`Army_Read.created_at` awaits a backend field" | **Stale, delete it.** The backend ships `created_at` and it is present in the generated schema. See [F9](#f9-clear-the-doc-and-dead-code-drift). |

[`CODE-REVIEW.md`](CODE-REVIEW.md) tracks correctness bugs. Its findings are referenced where a
structural cause sits underneath one rather than restated in full.

One nuance worth getting right, because it is a lesson about reading dated reviews.
`CODE-REVIEW.md`'s note on `Army_Read.created_at` is **not** the same claim as `SPEC.md`'s and was
**not** wrong. It said the field was absent from the hand-written `types.ts` while the backend sent
it, which was true on `main` and was fixed by this branch's move to generated types. `SPEC.md`'s
deferred note is the wrong one: it says the field "awaits a backend field", and the backend has
shipped it. A finding that was correct when written and has since been fixed is not an error, and it
should be closed rather than contradicted.

| Order | # | Item | Satisfies | Effort |
|---|---|---|---|---|
| 1 | [F1](#f1-clear-the-query-cache-on-sign-out) | ✅ Clear the query cache on sign-out | §3, §4 | Trivial |
| 2 | [F2](#f2-repair-type-generation-and-check-it-in-ci) | ✅ Repair type generation, check it in CI | §2.3 | Small |
| 3 | [F7](#f7-lock-in-the-accessibility-work-with-a-linter) | ✅ Lock in the accessibility work | §5 | Trivial |
| 4 | [F6](#f6-return-users-to-the-page-they-asked-for) | ✅ Return users to the page they asked for | §4 | Trivial |
| 5 | [F3](#f3-enforce-the-layering-rule-with-lint) | ✅ Enforce the layering rule with lint | §1, §2.1 | Small |
| 6 | [F9](#f9-clear-the-doc-and-dead-code-drift) | ✅ Clear the doc and dead-code drift | §6 | Trivial |
| 7 | [F5](#f5-make-query-keys-consistently-hierarchical) | ✅ Make query keys consistently hierarchical | §3 | Small |
| 8 | [F4](#f4-test-against-the-real-contract) | ◐ Test against the real contract | §7 | Focused |
| 9 | [F8](#f8-harden-ci-and-add-a-bundle-budget) | ◐ Harden CI, add a bundle budget | §8 | Small |
| 10 | [F10](#f10-move-the-owned-filter-to-the-server) | ✅ Move the "owned" filter to the server | §9 | Moderate, cross-repo |
| 11 | [F11](#f11-decide-what-zod-is-for) | ✅ Decide what zod is for | §2.2 | Decision first |

F10 changes a contract the backend owns. Land both sides together, or the gap becomes a mismatch you
introduced on purpose.

---

## F1. Clear the query cache on sign-out

**Satisfies:** §3 (server state), §4 (session). **✅ Done.**

`logout()` clears the token, the user, and the query cache. `login()` clears it too, which closes the
same leak by its other door: a session also ends involuntarily when the client drops the token on a
401, and clearing from that listener would remove queries that still have mounted observers, which
refetch, 401, and re-enter it. `clear()` rather than `resetQueries()` because the departing user's
refetches would carry no token. Two regression tests, both verified to fail without the fix.

The original finding, kept because the reasoning is the reusable part:

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

**Satisfies:** §2.3. **✅ Done** — the source is the backend's published `openapi.json` by URL, not a
sibling checkout, and CI regenerates and fails on any diff. The `ErrorCode` follow-on below is **not**
available: `openapi.json` contains none of the code strings, because the error bodies are built by
hand in the backend's exception handlers, so it would need a backend change first.

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

While in there: the `ErrorCode` union (`src/api/client.ts:46`, derived from the `ERROR_CODES` array at
`:37`) is still hand-mirrored from the
backend's enum. If the backend surfaces those codes in its OpenAPI document, this can be derived
rather than duplicated, which removes the last hand-maintained copy of backend knowledge.

**Concepts:** `openapi-typescript`; generated code as a build artifact versus a committed source file;
`git diff --exit-code` as a staleness gate in CI; hermetic builds.

---

## F3. Enforce the layering rule with lint

**Satisfies:** §1 (layering), §2.1 (one HTTP client). **✅ Done** for the token/`fetch` scope — four
ESLint rules, each verified against a deliberate violation. The `localStorage` scope stays open.

**What is missing.** The layering rule is followed everywhere and enforced by nothing.

Verified as currently true: exactly one `fetch` call site in non-test source
(`src/api/client.ts:114`), no view or UI component calls `fetch`, and no view imports a resource
module. That is a genuinely clean result.

But `eslint.config.js` extends the recommended presets and adds no import restrictions, so a view
could import `apiGet` or call `fetch` and lint, build, and all 156 tests would stay green. `SPEC.md`
states these rules in prose. Prose does not fail a build.

**One part of the rule is already broken**, which changes how you should scope it.
`src/views/CollectionView.tsx:29` and `:86` read and write `localStorage` directly for a layout
preference. That is benign, and arguably a fine use, but it means a blanket "only the client touches
storage" rule would fail on existing code. Decide which you want: confine the **token** (narrow, true
today, enforceable now) or confine `localStorage` entirely (broader, and it needs that preference
moved behind a small module first).

**Why now.** The `fetch` and import halves are currently unbroken, which is exactly when they are
cheap: adding enforcement to code that already complies is one config change and no refactoring. The
storage half already has one violation, so it costs a small refactor on top. Both get more expensive
with every additional violation, and by the time there are several the rule has quietly stopped being
true.

**Shape of the work.** ESLint can express "files in this directory may not import from that one".
Two mechanisms worth comparing: the built-in `no-restricted-imports` with path patterns, which is
zero extra dependencies and adequate for a handful of rules, or `eslint-plugin-boundaries`, which
models layers as first-class elements and scales better once there are more than a few. Start with the
rules that matter: `src/views/` and `src/ui/` may not import `src/api/client`, and nothing outside
`src/api/client.ts` may reference `fetch`. Add the storage rule once you have decided its scope.

The backend solved the identical problem with a layered import contract that runs in CI, and it is
worth reading how that is configured, because the concept transfers exactly even though the tool
differs.

**Concepts:** ESLint `no-restricted-imports` zones; `eslint-plugin-boundaries`; architecture fitness
functions, the general name for a test that asserts a structural property rather than a behavioural one.

---

## F4. Test against the real contract

**Satisfies:** §7 (testing). **◐ Partly done** — `src/api/devProxy.test.ts` closes the dev-proxy
agreement (§2.5 now Holds). The contract half waits on [F2](#f2-repair-type-generation-and-check-it-in-ci).

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

**One cheap addition belongs here** (it is why §2.5 is `Partial` rather than `Holds`): nothing ties the
API prefix the client sends to the prefix the dev proxy forwards. The resource tests assert the
outgoing URL, so the client half is covered, but `vite.config.ts` is never read by anything, so
editing the proxy pattern alone leaves all 156 tests green and breaks the dev server. A test that
imports the Vite config and asserts its proxy key is a prefix of `API_PREFIX` closes that, and it is
a good example of testing an *agreement between two files* rather than the behaviour of one.

Separately, there is no coverage threshold, so a new module can ship untested without any signal.

**Concepts:** consumer-driven contract testing; OpenAPI request and response validation; the
distinction between mocking a module, stubbing a transport, and testing a contract.

---

## F5. Make query keys consistently hierarchical

**Satisfies:** §3 (server state). **✅ Done.**

One rule now: `[resource, kind, ...]`. The explicit `'list'` / `'detail'` segment does two jobs — it
roots every key for a resource under one prefix (which the old sibling shape could not do), and it
keeps the list from being a *prefix* of the details, so invalidating the list alone needs no
`exact: true`. `invalidateArmyMembership` went from four enumerated keys to two prefixes, and the
inventory mutation's ad hoc `['army']` literal became the named `allArmies` prefix. The sweep covered
`unit`/`units`, which had the identical sibling bug this item only cited for armies.

The test named `'are stable and hierarchical'` was updated rather than deleted, and split: one half
still pins the literals, the other asserts the *relationship* between keys, so it keeps holding when a
key is added. A third test drives a real `QueryClient` — comparing key shapes with a helper of our own
proves nothing about TanStack Query's matching.

**What is missing.** The key factory (`src/api/queries.ts:39`) mixes two conventions:

- `armies` is `['armies']` and `army(id)` is `['army', id]` (`:41-42`). Different first segments, so
  they are **siblings, not parent and child**.
- `unitFacets` is `['units', 'facets', filters]` (`:46`), genuinely nested under the units namespace.

The consequence of the first: invalidating the prefix `['army']` does not match `['armies']`. I
checked the prefix-matching semantics directly rather than assuming. So each army mutation names its
keys by hand, and they do not agree with each other: `useUpdateArmy` (`:140-141`) invalidates both,
`useDeleteArmy` (`:151-152`) removes one and invalidates the other, and `useCreateArmy` (`:122-131`)
invalidates only `['armies']`. One inventory mutation reaches for the broad `['army']` prefix (`:208`)
while separately naming the inventory key.

Two things worth knowing before you start. `CODE-REVIEW.md` describes this layer as having
"hierarchical keys and precise invalidation", which was a fair reading of the invalidation discipline
but overstates the hierarchy: the keys are precise because each call site enumerates them, not
because the tree does the work. And `src/api/queries.test.tsx:30` is a test named
`'are stable and hierarchical'` that asserts the current inconsistent shape, so it will need updating
with the rename. A test asserting the thing you are trying to change is worth reading carefully rather
than deleting.

It works today. The cost is that correctness depends on remembering to list every affected key at
every mutation, and the three army mutations already disagree about which keys those are. The failure
mode is a stale view after some future mutation, which is the kind of bug that gets reported as
"sometimes it doesn't update".

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

**Satisfies:** §4 (session). **✅ Done.**

`RequireAuth` carries the attempted path, query and hash in router state; `AuthView` consumes it
through `src/lib/redirect.ts`, which returns `/` for anything that is not an internal path —
protocol-relative `//host` included, since it starts with `/` and is external. Seven tests.

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

**Satisfies:** §5 (presentation and accessibility). **✅ Done.**

`eslint-plugin-jsx-a11y` runs in lint, which gates CI. The first run found seven errors, as predicted:
four real (the modal overlay and card, a mislabelled scroll region), two the plugin not knowing this
codebase (`Input` registered as a control component; `region` allowed to carry `tabIndex`), and one
documented exception (`autoFocus` inside an explicitly invoked dialog, where APG asks for focus to
land inside on open).

**What is missing.** The accessibility work in this codebase is real and better than most projects at
this stage: 29 `aria-label` attributes across non-test components plus 3 `aria-labelledby`,
`aria-pressed` on toggles, `aria-busy` on async regions,
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

**Satisfies:** §8 (build and CI). **◐ Mostly done** — triggers widened so a PR into any branch is
checked, a bundle budget on the entry chunk, and coverage thresholds. The deploy step stays open: it
needs a Firebase credential stored as a repository secret.

**What is missing.** The pipeline is the right shape and ahead of the codebases this project is
measured against. `.github/workflows/ci.yml` runs `npm ci`, lint, `npm run build` (which is
`tsc -b && vite build`, so the typecheck gates too), and the tests, on every push and pull request.
Both reference repos have no CI at all.

Four gaps:

- **No bundle budget**, and the main chunk already grew measurably: **270.38 kB to 330.38 kB** (86.00 kB
  to 102.01 kB gzipped) between `main` and this branch. I built both rather than estimating. Be precise
  about what that measures: the whole branch, which also rewrote the client and added `src/lib/errors.ts`
  and the generated schema. It is an upper bound on zod's share, not zod's share. Isolating it is a
  one-line experiment worth running before F11's decision.
- **It only runs against `main`.** The triggers are `push: branches: [main]` and
  `pull_request: branches: [main]`, so a feature branch gets no CI until a PR targeting `main` exists.
  Note `SPEC.md` already describes this accurately ("push/PR to `main`"), so this is a gap to decide
  on rather than drift to fix.
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

**Satisfies:** §6 (docs). **✅ Done, except the repo-path references.**

The dead code is gone (`apiGetWithHeaders`, the four unreferenced hooks, and the `me` query key that
had no remaining consumer), and the docs describe what ships. The five `../warhammer_unit` references
are deliberately untouched: the local checkout really is `warhammer_unit`, so renaming them to match
the repo would break a working setup, and a sibling-checkout path cannot work in CI regardless. That
is [F2](#f2-repair-type-generation-and-check-it-in-ci)'s decision, not a rename.

Small, individually trivial, and worth doing in one pass because each item is a place where a reader
is actively misled.

**Docs that describe code that no longer exists:**

- `README.md:24` says the dev server proxies `/auth`, `/me`, `/units`, `/factions`. `vite.config.ts`
  proxies `/api`. The README was rewritten on this branch and this line survived the rewrite.
- Five places point at a repo directory named `../warhammer_unit`: `package.json:13`, `README.md:15`,
  `README.md:54`, `SPEC.md:8`, and `SPEC.md:192`. The repo is `Warhammer-unit`. The `package.json`
  one is what makes F2's command fail; the rest send a reader to a path that does not exist.
- `SPEC.md:158` and `:164` list `ToastContext.tsx` and `factionFlavor.ts` in the project structure.
  Neither exists. The same listing omits `src/lib/errors.ts`, `src/api/schema.d.ts`,
  `src/toast/toastBus.ts`, and `src/ui/ErrorBoundary.tsx`, all of which do.
- `MVP.md:49`, `:78`, and `:86` still describe the `X-Total-Count` header and hand-written `types.ts`,
  both removed on this branch. `README.md` links onward to `MVP.md`, so the front door routes readers
  straight into the stale description.
- `SPEC.md`'s deferred list says `Army_Read.created_at` "awaits a backend field". The backend ships it
  and it is present in the generated schema, so that item should be struck. `CODE-REVIEW.md`'s related
  note is a different and correct claim about the old hand-written `types.ts`, already fixed by this
  branch; close it rather than contradicting it. One leftover: `ArmyView.test.tsx:45` still writes
  `Army_Read & { created_at: string }`, an intersection the generated type makes redundant.

**Code that no longer has a purpose:**

- `apiGetWithHeaders` (`src/api/client.ts:157`) has **zero call sites** outside its own test. It
  existed to read the `X-Total-Count` header, which the backend removed when the total moved into the
  response body. Its doc comment still advertises that header, as does the header comment on
  `src/views/CatalogView.tsx:8`, whose code now correctly reads the body total.
- Four exported query hooks have no call sites **and no tests**: `useMe` (`src/api/queries.ts:56`),
  `useUpdateArmy` (`:133`), `useDeleteArmy` (`:146`), `useSetArmyUnitAmount` (`:180`).
  `src/api/queries.test.tsx` imports only `queryKeys`, `useUnits`, and `useCreateArmy`, so nothing
  references these four anywhere in `src/`.

**The general point**, which is the reason this is a roadmap item and not a chore: an exported
function reads as part of the module's contract whether or not anything uses it, and a doc that
describes a previous version of the system is worse than no doc because it is trusted. Both cost the
next reader time working out whether something matters. Deleting is a feature. If a hook is genuinely
planned rather than abandoned, a comment saying so costs one line and answers the question.

---

## F10. Move the "owned" filter to the server

**Satisfies:** §9 (cross-repo). **✅ Done.**

Both halves are server-side. `GET /units` and `GET /units/facets` each accept `owned`
([`openapi.json`](https://github.com/incaholy/Warhammer-unit/blob/main/openapi.json)), `src/api/units.ts`
sends it, and `CatalogView` takes its page, its total and its faction rail from one predicate, so
"N of M" cannot disagree with itself. [`ARCHITECTURE.md`](ARCHITECTURE.md) §9 reads `Holds`.

The original finding is kept below because the reasoning is the reusable part — but note its central
claim became false: it said the backend "exposes no `owned` filter", which was true when written and
is not now. A doc audit caught the contradiction between this entry and §9; this entry was the wrong
one.

**What is missing.** Filtering and pagination have to happen on the same side. If the server
paginates and the client filters, the filter only ever sees the current page.

The counting half of this was fixed properly on this branch: per-faction counts now come from a
server-side aggregate rather than being derived by downloading the catalog, which is what
`CODE-REVIEW.md` finding 1 asked for. Credit where due, that was the harder half and it was done right.

The filtering half is unchanged, and it is `CODE-REVIEW.md` finding 2 still open rather than a new
observation: `src/views/CatalogView.tsx:109` narrows the already-paginated page against the inventory.
Three consequences follow:

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

**Satisfies:** §2.2. **✅ Decided: validate success payloads too**, with the schemas generated from
openapi.json rather than hand-written. Measured first, as this item asks: zod is **15.52 kB gzip** on
its own (271.20 → 330.55 kB raw when added), essentially all of the branch's entry-chunk growth —
which makes errors-only the worst value of the three, since the library is paid for either way. The
generated response schemas add a further 2.78 kB gzip.

Zod currently validates exactly one thing: the error response body (`src/api/client.ts:132`). It is
imported in exactly one file. The success path still asserts with `as T` (`:146`).

That asymmetry is the question. Three coherent positions, and the point is to hold one on purpose:

1. **Errors only, as now.** Defensible: error bodies are the least predictable thing the API returns,
   they are the shape most likely to arrive from an intermediary rather than the app, and a wrong
   guess there produces user-visible nonsense. The cost is a runtime dependency earning its keep at
   one call site. The main chunk grew from 270.38 kB to 330.38 kB (86.00 kB to 102.01 kB gzipped)
   across this branch, though that figure covers everything the branch added, so measure zod's share
   on its own before treating it as the deciding number.
2. **Validate success payloads too.** Consistent, and it closes §2.2 properly. The cost is a second
   schema to maintain beside the generated types, and the risk is real: two sources of truth for the
   same shape drift, and then validation rejects data the API legitimately sent. If you go this way,
   generate the schemas from OpenAPI rather than hand-writing them, so there is still one source.
3. **Drop zod, hand-roll a type guard for the error body.** A narrow guard is a few lines, adds no
   dependency, and gives the same safety at this one boundary. It gives up the ergonomics if
   validation later spreads, and it is only clearly the right call if zod turns out to be most of
   that bundle delta.

There is no single right answer, and this is genuinely a judgement call rather than a gap. What is
not fine is the current situation being **undecided**: a dependency in the bundle whose scope nobody
has chosen, which is how bundles grow without anyone being responsible.

Note that the generated types (F2) already handle the *shape* question at compile time for well-behaved
responses. Runtime validation defends against the API not matching its own schema, which is a real but
narrower risk. Weigh it as such.

**Concepts:** parse, don't validate; runtime validation versus static types and what each actually
guarantees; `zod-to-openapi` and OpenAPI-to-zod generators; bundle cost per dependency.

---

# Kill Team

The design lives in [`KILLTEAM.md` in the API repo](https://github.com/incaholy/Warhammer-unit/blob/main/KILLTEAM.md) as 66 numbered decisions; this is
the **build order** for the frontend half. Entries are cited by decision number (`#44`) throughout,
because the reasoning is there and duplicating it here is how two documents start to disagree.

The backend shipped `K1`–`K7` (catalog, rosters, games, the withdrawn-row flag) and merged them to
`main` in [Warhammer-unit#5](https://github.com/incaholy/Warhammer-unit/pull/5). Its roadmap's Kill
Team preamble says *"Frontend views (warhammer_web) follow each step"* — these are those steps. `K7`
states its own gating condition in frontend terms ("before a client consumes the catalog as a
picker"), and `KF2` is where that condition is finally met.

**Item IDs are stable labels.** Unlike the `F` items above there is no priority table, because this
is a build order rather than a value order: each slice needs only the one before it. That is the same
reason the backend's `K` series has no `Effort` column.

**Baseline.** Measured on `kill-team-ui` (branched from `roadmap`) on 2026-10-08, after
`npm run gen:api` picked up the backend's Kill Team contract:

| | At the branch point (2026-10-08) | After KF1–KF3 |
|---|---|---|
| Tests | **37 files, 223 cases** | **46 files, 335 cases** |
| Paths in `src/App.tsx` | 7 | 17 (12 views, 4 redirects, 1 catch-all) |
| Route-level views | 7 | 11 |
| `src/ui` exports | 24 | 28 |
| API resource modules | 5 | 8 |
| `src/api/queries.ts` | 292 lines | 292 lines (Kill Team got its own module) |
| Published API paths | **49** (28 before the merge), of which **21** are Kill Team | unchanged |
| Generated Kill Team zod schemas | 23 | unchanged |

Both columns, because the left one is what the slices were planned against and the right one is what
they produced — a single column would have gone stale the moment `KF1` landed, which is how the
"144 tests" claim in three other docs got to be wrong four times over — those three now carry no
count at all, which is the only version that cannot rot.

**Evidence.** Reproduced against the running code, not read off a doc — which is the specific failure
these numbers are replacing. Three of the six root docs asserted "144 tests" when this was written; the real figure had been
four different values by then, so the claim was dropped from all three rather than updated. `npm run gen:api`, `npm run lint`, `npm run build` and the full
Vitest suite were each run to completion for the table above. Where something below is a judgement
call rather than a fact, it says so.

**Two CI gates shape every slice**, and they are the reason each one has to be genuinely thin:

- **Coverage floor** (`vite.config.ts`): statements 88, branches 82, functions 87, lines 90. A new
  module without tests fails the build. Intentional — "a floor, not a target".
- **Bundle budget** (`scripts/check-bundle-size.mjs`): entry chunk ≤ 108,000 B gzip / 347,000 B raw,
  **and at most 2% growth against the PR's base branch**. Every view below must be `React.lazy`-
  imported or it lands in the entry chunk and trips this.

A third constraint is structural rather than a gate: `eslint.config.js` restricts resource-module
imports **by name**, so a new `src/api/killTeam.ts` is exempt from the rule that protects every other
resource until it is added to that list. `KF2` adds it.

## Where Kill Team sits against the other roadmaps

The `F` items above are architecture-hardening — a different axis. These `KF` items are feature
build, the axis [`SPEC.md`](SPEC.md)'s steps 1–12 occupied. Nothing is renumbered.

One reconciliation is not cosmetic: **`SPEC.md`'s "Out of scope" section currently says game and
match tracking are "all out of scope on the backend too".** That is now false in both repos — the
backend has shipped a complete Kill Team tracker. `KF1` corrects it, rather than leaving a document
that contradicts the feature being built against it.

**Three decisions were settled when this was written**, so the slices below assume them:

- **The `/army-list` move is `KF1`**, not deferred. `KILLTEAM.md` #11 ties it to the first Kill Team
  view, and doing it later means more live bookmarks to redirect.
- **Paging follows the existing split**: the shared catalog stays paged, user-scoped collections are
  fetched whole with `fetchAllPages()`. The rule is about ownership, not size — 48 teams would fit in
  one request at `PAGE_LIMIT_MAX`, and the team list is paged anyway.
- **The four free-form fields are settled per slice**, not up front. `victory_points`, `choices`,
  `markers` and `tokens` are deliberately shapeless in the API; the backend left the call to whoever
  builds the screen, so each is decided against a real layout in `KF4` or `KF5`.

---

## KF1. Put the two sections side by side

**Status: ✅ Done.** No Kill Team code in this slice, deliberately — it restructured what was
already here so the second section has somewhere to go. `KILLTEAM.md` #11 splits the app into
`/kill-team/...` and `/army-list/...`, and ties the move to the first Kill Team view.

Two things were settled while building it. **`/` is a chooser**, not either section's index, so
neither game is the implicit default — it used to render the armies index, which made the 40k builder
the whole app. **The Header is two rows**, the top switching section and the second showing that
section's own pages, because a flat `Armies | Inventory | Kill Team` puts two pages and a whole
section side by side and has nowhere to grow. The Kill Team card and nav entry are shown but are not
links until `KF2`: omitting them hides half the app, and a live link bounces off the catch-all.

The redirects are built from the current pathname rather than a per-route `to` string, which is what
keeps a route parameter intact — `/armies/abc123` carries its id across, and the query string with
it. Checked against the mutant: a static `/army-list` target fails seven tests. The entry chunk
shrank 18.16 kB gzip (−17.42%) against the base, because `SectionView` importing the `ui` barrel
alongside the other lazy views made Vite hoist `ui.js` into a shared chunk.

The original scope, kept because the reasoning is the reusable part:

| Today | After |
|---|---|
| `/` | `/army-list` |
| `/catalog` | `/army-list/catalog` |
| `/inventory` | `/army-list/inventory` |
| `/armies/:armyId` | `/army-list/armies/:armyId` |
| `/armies/:armyId/catalog` | `/army-list/armies/:armyId/catalog` |

Every old path keeps a redirect, so bookmarks survive. `*` currently redirects to `/`; it needs to
keep doing something sensible once `/` is itself a redirect rather than a view.

**Shape of the work.** `src/App.tsx` owns the whole route table, the lazy imports, and
`crumbsForPath` — a hand-written path switch that string-splits the pathname. A new section needs its
own branch there or it silently renders a single crumb. `src/ui/Header.tsx` gains the two-section
nav. The one pathless `<Route element={<RequireAuth><AppLayout/></RequireAuth>}>` stays as the only
layout nesting level; the Kill Team catalog is the exception that will have to sit outside it (`KF2`).

**Docs change in the same PR**, per `ARCHITECTURE.md` §6. This slice invalidates the routing tables
in `SPEC.md`, the views table in `MVP.md`, and `README.md`'s layout block and 40k-only framing —
plus the "Out of scope" claim above, which both `SPEC.md` and `MVP.md` carried. That is most of the
long-standing doc drift closing as a side effect rather than as its own chore.

`ARCHITECTURE.md` needed nothing, against expectation: its only path references are API paths
(`/api/v1/me/inventory`), which have not moved, and §4 covers route *protection*, which `KF2` changes
rather than this.

**Still deferred:** entity-name breadcrumbs, already deferred in `App.tsx` and not made worse here.

---

## KF2. Browse the Kill Team catalog, without an account

**Status: ✅ Done.** Six reads, and **all six are public** — no `Authorization` header, no
session. So this slice shipped before any auth work touched it, and a team page is linkable and
shareable. It is also where `K7`'s gating condition is finally met: the frontend is now a client
that consumes the catalog as a picker.

Shipped in four reviewed commits: the data layer with no UI, the `Select` primitive, the team list
with the public route branch, and the team detail. The route tree gained a **second branch** — the
catalog sits outside `RequireAuth`, the shell reports whether there is a user rather than assuming
one, and the Header offers "Sign in" where a signed-in user sees "Log Out". `ARCHITECTURE.md` §4
records it.

Four decisions were settled while building it. **The composition is a tab, not a route**: the detail
read already carries `selection_rules`, so a separate page would be a second request and a second
navigation for data already in hand — the `/composition` endpoint stays unused here. **`Select` is
labelled rather than bare**, the opposite split from `Input`/`Field`, because the thing that was
missing was the label wiring and not the border. **Tabs are real `tablist`/`tabpanel` semantics**
rather than `SegmentedToggle`, which is a toggle group and belongs on a display mode like List/Grid;
kept local to the view, to be promoted when `KF4`'s game screen needs a team tab. **The faction
filter is server-side**, because filtering the 25 rows in hand would only narrow the current page.

Three failures worth recording, all of them tests that said nothing until they were made to bite.
`pluralize` already carries its count, so a total rendered twice. `animation: shimmer` referenced a
keyframe from another module — CSS Modules scopes keyframe NAMES per file, so the skeleton silently
never moved. And the detail fixture's operatives were named so that printed order and alphabetical
order **agreed**, under a comment claiming they did not, which made every ordering test built on it
unfalsifiable; only the `not.toEqual([...names].sort())` guard caught it.

The original scope, kept because the reasoning is the reusable part:

| Route | Serves |
|---|---|
| `/kill-team` | the team list, groupable by faction (#12 — factions are a flat list of their own) |
| `/kill-team/teams/:id` | one team whole — its datacards, rules, ploys, equipment (16–46 KB, median 24, per #47) |
| `/kill-team/teams/:id` → Composition tab | the printed composition, as text (#44) — a tab, not a route: the detail read already carries it |

**The display rules are not the frontend's to invent, and three of them are counter-intuitive.**
Everything carries `position` and is read in that order (#25) — sorting by name is wrong three ways:
the page prints the leader first in 46 of 48 teams, Strategy ploys before Firefight, and a rule beside
the rule that refers to it. Ties break on `id` (#53). Composition is **text**: one row per
`{position, depth, kind, text}`, rendered in `position` order and indented by `depth`, with footnote
bodies as their own `kind = 'note'` rows (#45, #30). Nothing is derived — no budget, no model count,
no caps, no entry resolved to a datacard (#44).

**What this slice must not do.** Offer any catalog editing (#21 — no path under `/api/v1/kill-team`
declares a method but `get`, by #49). Enforce legality of any kind (#28). A weapon rule keeps its
printed footnote marker, and whether `Torrent 0"` and `Torrent 0"*` are one chip or two is explicitly
the frontend's call (#56).

**Shape of the work.** `src/api/killTeam.ts` (one function per endpoint, each passing a generated zod
schema), hooks in a new `src/api/killTeamQueries.ts` — lint permits it, and `queries.ts` is already
292 lines holding every hook for every resource. Kill Team re-exports in `src/api/types.ts`. Fixture
builders in `src/test/fixtures.ts` plus new members in its `ApiBody` union, or a fixture that does not
match a real response shape will not fail typecheck. And `**/api/killTeam` added to the
`no-restricted-imports` list in `eslint.config.js`.

Teams and the cross-team operative listing stay **paged**, like `/catalog`. `/kill-team/universal` is
one route for the rows no team owns and is meant to be fetched once and kept for the session (#48).
Names are resolved from ids client-side (#46), the same `Map<UUID, string>` move `CatalogView` already
makes against `/factions`.

**A missing primitive blocked this immediately:** there was no `Select` in `src/ui/`, so a dropdown
meant copying `NewArmyModal`'s raw `<select>` + `useId()` + manual `<label htmlFor>`. Built as a
primitive instead, labelled rather than bare, and `KF3` and `KF4` now inherit it.

**Still deferred:** no reader for a single selection rule — the backend's own `K3` carve-out, and
nothing here needs one.

---

## KF3. Build a roster

**Status: ✅ Done.** Eight endpoints, all authenticated, at `/kill-team/rosters` and
`/kill-team/rosters/:id`. A roster read carries the whole pool a game will choose from — operatives
with their datacards, the team's rules and ploys, the universal ploys, and both equipment lists
(24–42 KB, median 31, per #52).

Shipped in five reviewed commits: the data layer with no UI, the list and create flow, the detail
read-only, the five writes, and these docs. `src/ui/Tabs` was promoted out of `KillTeamView` here,
exactly when the roster screen became its second caller, and `src/views/killTeamCards.tsx` took the
datacard pieces both screens render — a deliberate departure from the house rule, which covers
"feature-specific stays in the view" and "cross-feature goes to `src/ui/`" but not two views in the
SAME feature rendering the same thing.

Three decisions were settled while building it. **Reordering swaps two positions** in two PATCHes,
because `PATCH position` sets the value and shifts nothing (#53) — a single nudge leaves the pair
tied and a tie is broken by `id`, so the player would see an order they did not choose. **The picker
is inline**, not a route like the 40k catalog's: the pool is one team's dozen datacards where the
40k catalog is over a thousand units. **The reference is a tab**, because the roster read already
carries it (#52), which is also where the promoted tabs earned their place.

Four things were settled by reading the backend rather than guessing, and each is the kind of thing
that would otherwise have been invented: an `in_battle` datacard IS addable to a roster, since
`add_operative` refuses only a cross-team or withdrawn card, so availability informs and never
refuses (#51); both roster 409s arrive as id-free prose written for a person, so no client copy was
needed and two tests pin that contract; `KTRoster_Update.name` is server-constrained where
`Army_Update.name` is not, which reverses why the rename guards; and a roster LIST row carries
`kill_team_name` and `faction_name` where the catalog's team row carries only `faction_id`.

Four defects the tests found, none of which reading the code would have caught. An always-mounted
`Modal` fetched 48 teams and 22 factions for a dialog nobody opened. A stub routed a POST to a page
fixture, so a create's success path was never exercised while its body assertion passed. The move
buttons carried ambiguous accessible names where two rows hold the same datacard, which a keyboard
user could not have resolved. And a closed `<details>` still exposes its children to queries in
jsdom, so an assertion about a collapsed card passed either way.

Two mutants survived and both were right to: `total` versus `rosters.length` on a whole-fetched
collection, which cannot differ. Recorded as equivalent rather than forced into a test.

The original scope, kept because the reasoning is the reusable part:

**A roster row is one operative** (#50). No `amount`, no uniqueness on `(roster_id, operative_id)`,
and adding the same datacard twice **appends a second row** rather than answering 409 — because the
question a player asks is "which of my two Warriors is on 4 wounds?". Each row is addressed by its own
id. `position` is a sort hint, not a contiguous sequence: `move_operative` sets it absolutely and
shifts nothing, so every reader orders by `(position, id)` (#53).

**Availability informs; it never refuses** (#20, #51). An `in_battle` datacard greys out in the picker
rather than being rejected on save, and composition is shown beside the roster as description, never
as a gate (#28).

**Two 409s, and neither needed copy — this entry was wrong about that.** It said
`CODE_MESSAGES` would render both as "That already exists." and that this is where field-aware
conflict copy stops being optional. It is not: `messageForError` prefers the backend's `detail`
unless it embeds a UUID, and both messages are id-free and written for a person —
`"a roster called 'X' already exists"` (#64) and
`"roster 'X' is played by 1 game and cannot be deleted"` (#60). They reach the central toast
verbatim. Two tests pin that, so a backend reword cannot silently fall back to the generic string.

Rosters are **fetched whole** (`fetchAllPages`), like armies and inventory.

**A withdrawn catalog row behaves asymmetrically here, on purpose** (#55): a row already on a roster
still resolves and renders, so a roster built last month still works, while a *new* pick of a withdrawn
row is a 404. The picker never offers one, so the 404 is a race, not a normal path — but it is
reachable from a stale page and needs a message.

---

## KF4. Run a battle: the state half

**Status: ✅ Done.** Built: KF4a (the data layer and the 409 flow), KF4b (the battles list and
the create overlay), KF4c (the battle screen's frame, scoreboard, advance and undo), KF4d (the
writes on an operative row), KF4e (the datacard behind a card) and KF4f (the score, the killzone
markers, deleting a battle, and the cache and concurrency work the writes needed).
KF4g (equipment, fielding a datacard the battle produced, transforming one in place) is built too,
which completes the slice. It was separated out because each of those three needs a POOL the game's
snapshot does not carry: `KTGame_Read.equipment` is what has been TAKEN and `operatives` is what has
been FIELDED, unlike `ploys`, which IS the team's whole list — which is why spending a ploy needs
nothing extra. So those three read the catalog, which narrows the claim below rather than fitting
inside it.
11 paths carrying 15 operations, at `/kill-team/games` and `/kill-team/games/:id`. (This read
"roughly nine endpoints", which was wrong twice over: the figure, and the word. `endpoint` reads as
both a path and a method-plus-path, so a count beside it cannot be re-derived — the backend's own
`tests/test_docs_style.py` refuses the pairing for exactly that reason, and this repo has no
equivalent gate.)
This is the screen the feature exists for, and `KILLTEAM.md`'s own Frontend section specifies it:
**phone-first**, for use at the table. Large touch targets, one card per operative, and turning point,
CP and VP always visible.

**Two levels of detail**, both required: a compact list showing the whole team at a glance (name,
wounds, order, whether it has activated), and any card opening to the full datacard as printed, for
mid-activation lookups.

**RENDERING the game needs no catalog call** (#22, #24). It carries the whole snapshot — every
datacard, the team's rules, its ploys and the universal ones, the text of each piece of equipment
taken — and the snapshot never invalidates, because it is static for the game's life. So the screen
reads the snapshot, not the catalog API.

This said "no catalog call, **ever**" until KF4g built the three operations that disprove it. Adding
equipment (#17), fielding a datacard (#18) and transforming one (#19) each name a catalog id, and
the snapshot holds what has been taken and fielded rather than a pool to choose from. Each of the
three sits behind its own disclosure and fetches only once opened, so a battle still renders — and
is played — without the catalog; and both pool reads carry `staleTime: Infinity`, which is a
statement of fact rather than a tuning choice, because the catalog has no write route at all (#21,
proven by #49). `KILLTEAM.md` carries the same correction.

What that does **not** license is caching the game query: `KTGame_Read` carries the wounds, the CP,
the turning point and the scores in the *same body* as the datacards, so `staleTime: Infinity` would
freeze the live half along with the static one. #22 and #24 buy no CATALOG request; they say nothing
about re-reading the game. `useGame` therefore sets no `staleTime`, and a test pins `isStale` as true
as soon as it resolves. (This paragraph said "the detail query is fetch-once" until KF4a measured it.)

**Three state rules the UI derives rather than reads:**

- **"Has it activated?" is a comparison**, not a flag: `activated_in_turning_point` against the game's
  own `turning_point`. `advance` clears nothing (#61).
- **`initiative: null` renders "not rolled"**, never as the opponent's. `advance` resets it to null
  each turning point (#62). **Revisit this one.** KF4c words `player` as "You" and `opponent` as the
  opponent's name, which works but is awkward: a three-valued field carrying one side's identity has
  to be read relative to the caller. `KILLTEAM.md` #67 (K8) drops `opponent_name` and gives a game two
  SIDE rows with their own display names, so "whose initiative" becomes a reference to a side rather
  than a token meaning "not me". There is likely a simpler formulation after that lands.
  `initiativeLabel` in `src/lib/killTeamGame.ts` is deliberately the only place that would change.
- **Every write is an absolute value**, never a delta — `wounds: 7`, not `-2` — for retry safety (#7).
  **And `version` is not sent on a row write** (KF4d). `PATCH …/operatives/{row_id}` answers
  `KTGameOperative_Read`, which carries no `version` and no response header, so a client cannot learn
  the game's new version from its own write — and since #9 moves the version on EVERY write, sending
  the last-rendered one makes a second tap conflict with the player's own first tap. The
  `version_id_col` still refuses a genuine concurrent write at flush; what is given up is the stale-READ
  overwrite. An `ETag` on the write response would close it, which is the natural companion to #79's
  `If-Match` — reconsider the trade when that lands rather than inheriting it.

`activate` and `transform` are their own `POST` routes; the operative `PATCH` carries only what a
client genuinely sets: wounds, order, tokens, actions used (#63). The opponent's VP is entered by hand,
and VP is stored by source (#5).

**The 409 mechanism is net-new, with nothing in this repo to mirror.** There are no optimistic
updates, no `onMutate`, no ETag and no version concept anywhere in `src/`; `'CONFLICT'` is one of seven
error codes with a generic string. But #9 means **every** game mutation moves the version — including a
write to a child row, which is the part that makes this unavoidable — and a stale write is a 409. The
realistic scenario is not two browser tabs; it is a phone and a laptop on the same table. Three shapes
to think through, in increasing cost:

- Re-read on 409 and let the player retry, with the conflict surfaced plainly.
- Send `expected_version`, which the service honours purely to give a better message.
- Optimistic update with rollback on conflict — the most work, and the only one that needs a
  `setQueryData` path that does not exist today.

**Service-enforced bookkeeping arrives as 400 `VALIDATION`, and is not rules enforcement** (#1): wounds
within `0..max` with 0 ⇄ incapacitated in both directions, an incapacitated operative cannot activate,
one activation per operative per turning point, CP never negative, no turning point past four. Each
needs copy that reads as bookkeeping rather than as the app refusing a play.

**Open, and closed here:** the shapes of `tokens[]` (named chips on an operative), `markers[]`
(team-level, on the game) and `victory_points{}` (by source, per #5). The API leaves all three
shapeless on purpose.

**Watch the bundle.** This is the heaviest view in the app and the 2%-growth check measures against the
base branch, so it must be lazy and may need splitting internally.

---

## KF5. Run a battle: the reference, and the log we keep

**Status: ✅ Done.** Two tabs, the team's reference, the per-game `choices`, and a quick
reference for the strategy ploys in play. **The event log is deliberately NOT rendered** — see below.

**What this entry used to describe, and where it actually landed.** It was written before KF4c–KF4g
and five of its paragraphs became history: revealing equipment with `PATCH .../equipment/{row_id}`
and adding the datacards it grants (KF4g), spending a ploy as one operation (KF4c), transform in
place (KF4g), and the `undo` control (KF4c). What was genuinely left was the reference half, and
four fields of `KTGame_Read` that nothing rendered: `rules`, the full `ploys` detail, `choices` and
`events`.

**Two tabs, Battle and Reference**, which is what finally justifies the tablist KF4c shipped
without — one tab is noise. The line between them is whether a panel can change the game:
everything behind Battle writes, nothing behind Reference does. `KILLTEAM.md` asks for a "team tab"
holding the rest of the reference, and this is it.

Equipment **splits** rather than moving. KF4g's controls — take, reveal, remove, the count against
`equipment_limit` — stay in Battle; the Reference tab shows each taken piece's snapshotted `text`,
which nothing rendered before. No duplicated controls.

**`Rules` and `Ploys` widen; `EquipmentList` could not.** The same move KF4e made for `StatLine`,
`Weapons` and `Abilities`: a snapshotted rule or ploy is a strict SUBSET of the catalog's, missing
only `id` and `position`, so the shared components now declare the fields they read. A snapshotted
piece of equipment is **not** a subset — the catalog calls its prose `description` and the game calls
it `text`, and the row adds `revealed`. A rename is not a narrowing, so the battle screen renders its
taken pieces through a new `Entries` component instead. The ploys also split on the `universal` flag
the game read carries and the catalog shapes do not, so this needs no second request where the team
page fetches `/universal`.

**`choices{}` closes the last open shape**, as a label to a line of text: the Accursed Gift, a Tac Op
taken. It is the only writable field on a game the service validates **not at all** — `victory_points`,
`ploys_used` and `actions_used` each get a validator and this gets none, because #59 keeps Tac Ops and
archetypes out of the project entirely, so nothing could enumerate either the labels or the values.
Being the sole author of the shape is why the read is narrowed and why the write drops what the read
refused: a screen must not edit a document it is not displaying.

**A quick reference for the strategy ploys spent this turning point**, in the controls band. It
reports a fact and not a duration — the ploy was spent, it was spent in this turning point, and its
`kind` is `strategy`, all from data the game already carries. How long one lasts is a rule and #1
leaves rules to the players, so it is labelled "spent this turning point" rather than "active": the
same set, and only one of them is a claim the tracker may make. Names only; a description is several
lines and sits in the section below and in the Reference tab.

It rides along with the buttons rather than claiming a region. The sticky stack on this screen is
already the app header's two rows plus the scoreboard, the controls and now the tablist; a fourth
element would take most of a phone before an operative appeared. It is paid for by the controls
laying out as a **row** on a phone instead of a column — two stacked buttons cost more height than
the chip row does — and it is absent entirely when no strategy ploys are in play.

**The event log is ours, not the player's.** It is a developer and debugging record, so this slice
renders none of it. That makes a measurement worth recording rather than acting on yet:
`KTGame_Read.events` is embedded with **no cap** (`killteam_game.py` serialises the whole
relationship), and with a realistic `before`/`after` payload of 238 bytes an event, a 12-operative
battle costs **8.8 kB with no log, 20.5 kB at 50 events and 56 kB at 200** — and KF4d refetches the
game after every row write. A four-turning-point battle plausibly logs 150–250 events.

So the client pays, on every write, for data it never displays. The ask of the backend is therefore
simpler than pagination: `KTGame_Read` should drop `events`, and #91's paged collection can serve
whoever needs them — us, and #72's polling. Deferred deliberately. It is safe to defer because
`undone_by` is a field on each event, so "has this been reverted?" needs no cross-event computation
and a paged read is a drop-in swap of the data source rather than a redesign.

**Still deferred:** no redo, by #58. No Tac Ops or archetype gating, by #59 — gating a choice by
archetype would be applying a rule, which #1 puts out of scope.

---

## KF6. Two players on one battle

**Status: Not started, and BLOCKED on the backend.** The design is settled and lives in the API
repo; none of it is built on either side. `KILLTEAM.md` decisions #67 and #74 (K8) and #70, #72,
#75, #81, #82 and #89 (K9) are the specification, and this entry exists because **every obligation
they place on a CLIENT was written down only in the other repository.** A convention recorded in
one repo and owed by another is the shape of defect this roadmap has found twice already.

**What blocks it.** Decision #72 converges two clients by polling
`GET /me/kill-team/games/{game_id}/events`. That path is **not published**: measured against
`openapi.json`, zero event paths exist, and `KTGame_Read.events` is embedded in the game read
instead. So the cheap delta poll cannot be written yet. Re-reading the whole game on a timer is the
alternative and it is the thing #72 exists to avoid — a 12-operative battle is roughly 11 kB of
JSON, nearly all of it a snapshot that #24 guarantees will never change.

**The polling contract, verbatim obligations on this client** (#72). Every one is ours to honour;
the decision says plainly that nothing on the server enforces any of it, because there is no rate
limiting:

- Poll **every 3 seconds** while the game screen is focused.
- **Stop while hidden**, and do one immediate catch-up read on regaining focus.
- On a network error or a 5xx, back off 3s → 6s → 12s → 24s, capped at **30s**, and reset on
  success.
- On a `404`, stop and show the tombstone #81 adds.
- No WebSocket and no SSE. The reasoning is the deployment: Cloud Run caps a request at 60 minutes
  and a game runs longer, `--max-instances 5` with no session affinity puts two sockets on
  different instances, and `--min-instances 0` means an open socket bills a container for the whole
  game.

**Two states a client MUST render** (#89), neither of which exists today:

- **No opponent yet** — `KTGame_Read.opponent` is null until a side's team is known (#74), so the
  screen shows your side and an invitation prompt, never an empty opponent panel.
- **Polling failing** — after the first failed retry, say the screen is out of date and when it
  last succeeded: "last updated 14:32, reconnecting". Stale and disconnected are deliberately NOT
  distinguished, because a client cannot tell them apart reliably.

**What else changes on this screen.** `opponent_name` and `opponent_victory_points` are dropped and
replaced by two side rows (#67), so KF4f's opponent controls are rebuilt rather than extended —
which is why KF4f deliberately left `opponent_name` uneditable. A list row gains `your_side` and
names both teams (#75), so `KillTeamGamesView` must say which half of a matchup is yours. The event
log gains an actor, and the undo control must NAME the actor and the event before it is pressed
(#70). Deleting a battle and minting an invite become host-only, and a participant refused one gets
**403** rather than the house 404 (#82).

**Reported from use, and mostly already designed.** Someone played a battle against an "opponent"
and hit three things. Two of them are what K8 and K9 exist to fix, and the third is ours alone:

1. *"The creator has to know the opponent's account name."* — They do not, and never will: `#71`
   specifies an **invite code**, and its details read as if written for exactly this moment. Eight
   characters from `secrets`, with `O`/`0` and `I`/`1`/`l` removed from the alphabet — an alphabet
   chosen so a code can be read off one screen to a person standing next to you. ONE slot, cleared on
   redemption, so it is single use; a 15-minute lifetime; redeemed by `POST /me/kill-team/joins` with
   the code in the BODY, because a code in a path lands in access logs, browser history and every
   proxy between.
2. *"The opponent could not pick their own roster."* — `#69`: a side carries its own `roster_id`, and
   its datacards are snapshotted at join exactly as `#22` snapshots the creator's.
3. *"Both players could change the creator's team, and the opponent had no team of their own."* — Two
   different things. Having no team of their own is `#67`/`#69`, unbuilt. Editing each other's side
   is `#87` and **deliberate**: "a write is NOT scoped to the writer's own side", because one person
   holding one phone is the ordinary case at a table and the opponent asking you to tick their
   operative down is not an edge case. The actor is recorded (`#70`) so the write is visible rather
   than silent.

**The third finding is the client's, and it is FIXED.** Nothing is built on either side — zero
invite or join operations are published, and `opponent_name` is a nullable string. But
`NewGameModal` asked for "Opponent" as free text, which *reads* as naming a person who will join.
The field is a LABEL on a battle, and the screen did not say so, which is why a tester reasonably
expected a person on the other end of it.

It now reads "Opponent's name", placeheld "a label for this battle", with the modal's note adding
that naming an opponent does not invite them. A test pins both, so the field cannot drift back to
promising a feature two backend slices away — which is the general hazard: a free-text field costs
nothing to build and every placeholder for future work is also a claim to a user about what exists.
To be reworded again when K9 makes this a side with an occupant (#67, #74).

**What KF4f already did for it.** `useGame` carries a `structuralSharing` guard that refuses any
read which would regress the game's `version`. Polling makes that necessary rather than tidy: every
3 seconds is another chance for a read issued before a write to land after it, and `versionFrom`
reads that cache to decide what the next write asserts. The guard was added before the polling
existed because retrofitting it later means auditing every path that touches the key instead of one.

---

## KF7. Finish a battle, and read the screen while playing one

**How this entry is maintained.** The status marker and any corrected claim change in the SAME
commit as the code, not in a follow-up. Five markers went stale in the course of building KF4–KF7,
always the same way: an entry's body is written while planning, the plan is tested by building it,
the correction goes into a commit message, and the entry a reader scans still says the old thing. A
commit message is not what anyone greps. `ARCHITECTURE` §6 already puts docs in the same PR as the
code; this tightens it to the same commit, which removes the window where the entry contradicts the
repo.

It also argues for writing these entries THINNER up front — the problem and the constraint, not the
rendering. Measuring has overturned a KF7 plan twice and confirmed existing code once, so the parts
written before measuring are the parts that go stale.

**Status: Built.** **A** (finishing and leaving a battle), **B** (a reference you can scan, and a
battle tab in use-order), **C** (the composition beside the roster being built) and **D** (initiative
and board status) are all built.

Everything here came from playing a battle through rather than from a review. Four groups, in the
order they hurt.

### A. Ending a battle is a dead end

Finishing works and then the screen has nothing to offer: no summary of what the battle came to, and
no way back to the list. The breadcrumb does link to `Battles`, but it lives in `AppLayout` above the
view and is not sticky, so it is gone the moment a long battle screen is scrolled — which is how five
slices of testing missed it. The only `← Battles` link is in the error state.

**The finish becomes two steps, and that is forced rather than preferred.** #66 closes a finished
game to edits: `_require_game` refuses one by default and exactly four callers opt out — the shallow
read, `delete_game`, `advance` (which refuses with its own message) and `undo`. So a victory-point
write after the finish answers **400**, and "adjust the final score" is not something a later screen
can offer. The adjustment has to happen before the write that closes the record.

So `Finish battle` opens a summary instead of mutating: both scores, the victory points broken down
by source, and the steppers still live, then a confirm. Afterwards the top of the Battle tab becomes
the result — the score, `Undo to reopen` (#66's only way back), and `← Battles`.

**A back link that survives scrolling** goes inline with the scoreboard's eyebrow. The scoreboard is
already sticky and the eyebrow row has space, so it costs no height.

**One decision left open.** A final-score screen naturally wants to name a winner, and higher VP is
the basic win condition — but declaring it is an inference, and #1 is that the tracker records while
the players apply. The plan is to show both scores neutrally (`You 6 · Kesh 4`) and print no verdict.
Revisit if that reads as evasive in use.

### B. Reading the screen while playing

Reported from use, and it is presentation rather than behaviour.

**The roster's Reference tab is not organised for reading.** It renders three flat `<dl>` lists —
team rules, ploys, equipment — each a name and a paragraph, with the universal rows appended under a
subhead. Nothing is grouped and nothing collapses, so finding one rule means reading past the others.
`KTGameRule_Read` and `KillTeamRule_Read` both carry `group`, which `Rules` currently prints as an
aside beside the name, so grouping BY it needs no new data.

**Corrected after measuring (group B, built).** That paragraph pitched grouping as the cheap big win
and it is not. Over the real scrape: **30 of 127** team rules carry a group, across **6 of the 48
teams** — three Aspect Techniques sets and three Upgrade sets, five rules each — and a median team
has **two** rules. Grouping two things is noise. What the same measurement did show is that rules are
the DENSEST prose on the tab, a median of 470 characters against a ploy's 282, while every team has
exactly 8 ploys and 4 pieces of equipment. So volume per entry was the reading problem, collapsing
each entry was the fix, and grouping stayed as a footnote that is right for six teams and invisible
for forty-two. Recorded here because the claim above is what a reader scans.

**The battle screen's information is in the wrong order and the wrong sizes.** The Battle tab stacks
score and command, killzone, choices, this turning point, equipment, operatives, then delete — which
is roughly the order the slices were built in and not the order a player uses. Operatives are the
most-touched thing on the screen and they are fifth. Setup-ish sections (choices, killzone) sit above
the ones used every activation.

**The battle's reference blocks must collapse.** Once a player remembers a rule they do not want it
in the way of the one they are still looking up. The datacard already works this way (KF4e, a
`<details>` per operative) and the reference tab does not.

Scope note: this is layout, ordering, type scale and disclosure state — not new data and no new
requests. Nothing here changes what is written or read.

### C. Composition beside the operatives a roster holds

Building a roster gives no sight of what the kill team is allowed to field. The rules exist and are
already rendered — `Composition` is a component in `KillTeamView`, fed by
`KillTeam_Detail.selection_rules` (#44: composition is TEXT, the page's own words in the page's own
order). They are simply not on the screen where a roster is built.

**Not a third tab**, which was the first plan and the wrong one. The whole point is that a player
deciding what to add should not have to navigate away to remember what is valid — and a tab is
navigating away. It belongs on the Operatives tab, between the rows already saved and
`AddOperative`, so the question and the answer are in one place.

**Shape — and this paragraph was wrong, corrected when it was built.** It said
`KTSelectionRule_Read`'s `kind` gives a compact rendering, with the `heading` rows reading as the
shape of a legal team and the detail expanding under them. Measured over the real scrape: there are
**6 heading rows in the whole catalog, all in one team of 48**, so that would have produced an
unstyled flat list for forty-seven teams.

`depth` is the actual structure — 204 rows at depth 0, 549 at depth 1, 144 at depth 2, with only 2 of
the 48 teams flat — and the rows are SHORT, a median of 25 characters, so a median team's 18 of them
simply fit with nothing collapsed per row. Depth 0 is a requirement ("1 INTERROGATOR operative", "5
operatives selected from the following list:") and depth 1 the options under it.

`Composition` already indented inline from `depth`, written from the data in an earlier slice. #44
had warned about this directly — composition is text, "the page's own words in the page's own order",
nothing derived — and keying a rendering off a kind the pages mostly do not print is deriving
structure that decision refused to derive. The whole BLOCK is a disclosure, open on arrival, which is
the one place this disagrees with B: B hides paragraphs a player has finished reading, this is a list
they read while choosing.

**Cost, stated rather than discovered.** `KTRoster_Read` does not carry `selection_rules`, so this
needs `useKillTeam(roster.kill_team_id)` — the team detail, 16–46 KB and a median of 24 over all 48
teams (#52). Putting it on the DEFAULT tab means fetching it whenever a roster is opened, where the
tab version would have fetched only if someone looked. That is the price of the thing being there
when it is wanted, and it is paid at most once per session per team: the read carries
`staleTime: Infinity`, which #21 and #49 make a statement of fact rather than a tuning choice.

`Composition` gets promoted out of `KillTeamView` into the shared card module, which is the move
`Tabs` made when the roster page became its second caller.

### D. Two fields the screen reads and cannot write — BUILT (slice 5)

Found by enumerating every writable field against the controls built, not by using the screen, and
held back deliberately: the groups above affect every battle and these two affect some.

**The dev database proved the entry before a line was written**: all six games held `initiative`
NULL and all forty operatives read `on_board`. Neither column had ever carried anything else,
because nothing could write them.

**The allowed values came from the CHECK constraints, not from `openapi.json`.** Both fields publish
as a bare `string` with `maxLength: 16`, so neither `tsc` nor zod can reject a wrong literal — the
trap this repo's `CLAUDE.md` names, and the one that produced four invented literals earlier in the
same branch. `ck_kt_game_initiative` allows NULL, `player` or `opponent`; `ck_kt_game_operative_status`
allows `reserve`, `on_board` or `incapacitated`. They are written down in `src/lib/killTeamGame.ts`
as `as const` arrays beside `GAME_STATUSES`, which exists for exactly this reason.

**Initiative sits in "This turning point", not in the scoreboard that displays it.** That is its
actual lifetime: `service_killteam_game.py:502` says advancing "puts initiative back to nobody for
its roll-off" (#62). A control in the sticky chrome would also have grown the one band KF8a and KF8c
both went after — measured at 437px of an 844px phone before any content.

The control carries THREE options for a field with two allowed values, because `null` is a state and
not an absence (#62): it MUST NOT read as the opponent holding initiative, which is what a falsy
check produces. `SegmentedToggle` is generic over `T extends string` and cannot hold `null`, so a
sentinel stands in and is converted back at the one place that writes it.

**Board status sits in the operative row's folded half**, not the always-visible strip: it is not one
of the four `KILLTEAM.md` asks to see at a glance, and that strip already wraps to two lines at 390px
(KF8c). `incapacitated` is not offered, and the row shows derived copy instead of a disabled control
— the service couples zero wounds to it in BOTH directions, so a control there would be overruled.

**Verified against the running stack, and the event log is the proof.** Setting initiative wrote
`{"after": "player", "before": null}` and clearing it wrote `{"after": null, "before": "player"}` — a
real NULL, never the sentinel. Board status wrote `reserve` then `on_board`, underscore intact. The
scoreboard followed the control both ways, and the battle was left exactly as found.

**One consequence worth stating: initiative now appears twice**, read-only in the sticky scoreboard
and writable here. That is deliberate — the scoreboard is the glance `KILLTEAM.md` asks for — but it
broke two existing tests that used an unscoped `getByText`, which now scope to the scoreboard through
the battle title it contains.

**Initiative cannot be set.** `KTGame_Update` accepts it and the scoreboard displays it, but nothing
writes it — so it reads "Not rolled" for a whole battle. Worse than a missing control: `advance`
resets it to null every turning point (#62), so the field is actively cleared and never fillable. It
needs a THREE-state control, because null is a real state and not an absence; `SegmentedToggle` takes
a string, so `player` / `opponent` / `none` with `none` written as null.

**An operative's board status cannot be set.** `reserve` / `on_board` / `incapacitated`, and the only
thing that moves it is the service coupling zero wounds to `incapacitated`. So a team that starts
operatives off the board — Raveners' Burrow, which `KILLTEAM.md` names — cannot record it. The
control is a two-state toggle; `incapacitated` stays read-only and derived, because the service
couples it in BOTH directions and its own comment warns that asymmetric automation is worse than
none.

### Dropped

**Equipment chosen on a roster.** Asked for, then withdrawn. There is nowhere to store it: #52 says
the two equipment lists are the pool a game CHOOSES from and "the choice itself stays per game (#17),
so there is no `KTRosterEquipment`" — confirmed in the schema, where `KTRoster_Create` and
`KTRoster_Update` take only `kill_team_id`, `name` and `description`. Persisting a selection is a
backend decision that partly retires #17, not a frontend slice.

---

## KF8. Hold the phone to the same standard as the desktop

**Status: KF8a, KF8b, KF8c and KF8d built.** Slice 1 fixed the sticky overlap and the current
stage; slice 2 built the three mechanical rules and their test. Written thin on purpose, per KF7's
maintenance note: the problem and the constraint, not the rendering.

**Why this is an entry and not a review.** The Kill Team screens ARE phone-aware — every one of
their stylesheets carries a `max-width: 640px` block, and `Modal` is fluid (`width: 100%` with a
`max-width`). What is missing is not responsive CSS. It is that three platform constraints with
NUMBERS attached are currently unmet and nothing checks them, so they will be met and then drift.

### The three mechanical ones, and the test that keeps them met

Each is a fixed rule, so each belongs in a static test over the tree in the style of
`src/styles/cssModules.test.ts` — not in a style guide and not in a review.

**Built as `src/styles/platformRules.test.ts` (slice 2)**, 9 tests. It reads the stylesheets off disk
because none of this is reachable from a rendering test: jsdom implements the DOM and parses CSS but
lays nothing out, so an element declared `position: sticky; top: 0; height: 120px` reports those
values back and a bounding rect of `0x0`. Heights, overlap and media queries are all invisible to the
suite, which is KF9's whole argument.

All three rules are scoped to `@media (pointer: coarse)` rather than to a width. The problem is a
TOUCH behaviour, not a narrow one: a width breakpoint would miss a tablet in landscape and would
change a desktop design that has no such problem.

1. **No interactive control under 16px.** iOS Safari auto-zooms the page when a field under 16px
   takes focus, leaving the player scrolled somewhere they did not ask to be. `Input` is 13px and
   `Select`'s control is 13px, and this app puts fields across the battle screen: a token field on
   every operative, the marker field, the victory-point source, both `choices` fields, every picker.
   At a table that fires constantly.

   **Exactly two controls, not six.** A static audit counted six sub-16px values and four of them are
   LABELS — `Field` at 10/11px and `Select`'s label at 10/11px — which do not trigger zoom. Only the
   `Input` and the `select` itself do. Worth stating, because a rule written as "no font under 16px"
   would fail on four values it has no business touching.

   **FIXED (slice 2), and measured in a browser on a live two-team battle**: 17 text-entry controls
   rendered at 13px before, and 0 under 16px after. The test asserts the 16px floor on `Input` and
   `Select` only, for the same reason — a `Button`, `Tabs` or `SegmentedToggle` label takes no text,
   so it cannot take focus and cannot trigger the zoom. Those three get the target without the font.
2. **Tap targets of at least 44px**, Apple's minimum. `Button` is `font-size: 11px` with `11px`
   padding — roughly **35px** — and its small variant is `10px` with `7px`, roughly **25px**.

   **Measured on the battle screen, every control failed: 82 of 82 under 44px.** Inputs and selects
   at 41px, buttons from 26px to 37px. The estimates above were close for `Button` and the count was
   the surprise.

   **Five primitives carry the rule, not three (slice 2).** `Input`, `Select` and `Button` were
   chosen by reasoning about which primitives existed, and that was wrong: applying the rules in a
   browser left **23 controls still under 44px**. Two were primitives the list had missed — `Tabs` at
   37px, and `SegmentedToggle` at 31px with **twelve instances on one battle screen**, one
   Conceal/Engage toggle per operative, which makes it the most-tapped control in the app. With all
   five covered the count is **9**.
3. **Every animation needs a `prefers-reduced-motion` escape.** 14 stylesheets animate and **8 have
   none**: the six Kill Team views, plus `ui/Modal` and `ui/Toast`. The convention existed in the
   same folder — every 40k view pairs its shimmer with an escape — and did not propagate because
   nothing enforced it, which is the argument for the test rather than the guide.

   **It reaches `src/ui/`, which changes who owns it.** This was first written as "the newest code
   drifted from a 40k convention". `Modal` and `Toast` predate all of the Kill Team work, so the
   convention was never universal in the first place.

   **FIXED (slice 2): 14 animate, 14 carry an escape, 0 missing.**

### Four stylesheets with no phone block that need one — FIXED (slice 2)

Four, not three: the heading said three while the list below it named four, which is the count error
this repo's documentation rule exists to catch.

14 have none; most are primitives that are intrinsically fluid (`Tag`, `Eyebrow`, `Toast`) and
genuinely do not want one. These four are not:

- **`NewGameModal` and `NewRosterModal`** — the create flows. `NewGameModal` puts a roster picker and
  two fields in a row, which will be cramped at 390px.
- **`SectionView`** — the `/` chooser, 12 rules and no phone block. It is the first screen anyone
  sees.
- **`SegmentedToggle`** — three segments for the equipment/rule source, which may overflow its row at
  phone width.

### The nine controls slice 2 left under 44px, on purpose

**Status: Planned.** Every one is a navigation `<a>`, and all nine are in the header or the
breadcrumb trail. Measured on a live battle screen with the coarse-pointer rules applied:

| control | file | height |
|---|---|---|
| `.crumb` ×2 | `src/ui/Breadcrumbs.module.css` | 15px |
| `.back` | the view's own stylesheet | 20px |
| `.brand` | `src/ui/Header.module.css` | 24px |
| `.navLink` ×5 | `src/ui/Header.module.css` | 31–34px |

**Why a `min-height` is the wrong fix here, which is the whole reason this is a separate entry.**
A taller header is exactly the complaint KF8a answered. The report was that the nav "did not go away
fast enough" and covered the battle heading, and slice 1's own measurement found the app header
occupying a 96px band. Giving five nav links 44px each MAKES that worse, and on a phone the header is
the scarcest space on the screen.

So this is a layout decision about the phone header, not a number: collapse the nav behind a control,
hide it on scroll, or accept small targets for navigation specifically on the grounds that a player
hits Conceal/Engage every turn and the nav twice a session. The five primitives were a number and are
built; this is a design question and is not.

`.crumb` at 15px is the one that is hard to defend under any of those options.

### What the test cannot do

Everything above is a number. The rest needs a device, so it is a checklist rather than a gate: no
horizontal scroll; every control reachable with one thumb and none of them under the sticky stack;
how much of the screen is chrome before the first operative (app header, scoreboard, controls,
tablist); whether the finish summary scrolls with its steppers reachable; and long content — a
101-row composition, the one 18-rule team, 14 operatives.

**The breakpoint asymmetry says where to look first.** The 40k views are tuned at four widths
(360/480/720/768px) and every Kill Team view at one (640px). So the screens most likely to need
attention are the newest ones, which is the opposite of the usual assumption.

### The sticky regions overlap — FIXED (slice 1)

**All four sticky elements are pinned at `top: 0`**: the app header (`z-index: 50`), the battle
screen's scoreboard (40), its controls (39) and its tablist (38). `position: sticky` does not stack —
each element independently pins to the offset it is given — so all four claim the same strip of
screen and `z-index` decides which one is visible.

**Measured in a real browser, and it is worse than "jumbled".** After scrolling, on a live battle:

| region | top | bottom | z-index |
|---|---|---|---|
| scoreboard | 0 | 96 | 40 |
| controls | 0 | **64** | 39 |
| tablist | 0 | **48** | 38 |

Three overlapping pairs. The controls and the tablist sit ENTIRELY inside the scoreboard's 96px band,
so **Advance, Undo and the Battle/Reference tabs are completely occluded** once a player scrolls —
not merely crowded. The app header behaves differently again: at desktop width it scrolls away
(`top: -221` after a 900px scroll), so it covers the scoreboard during the transition rather than
permanently, which is what "did not go away fast enough" described.

This is KF9's assertion #1 run by hand, and it took one call: three lines of geometry catching a
defect that survived four slices and 580 tests.

**The root cause was one line in `global.css`, not the four `top: 0` values.** `html, body, #root`
carried `height: 100%`, which makes the root box exactly one viewport tall while the document is
longer — so content OVERFLOWS it, and a sticky element sticks only within its containing block.
Measured on the 2611px battle screen: `#root` was 775px and the app header **detached at
`top: -521`** after a 1200px scroll. That is what "the header did not go away fast enough" was. It
also capped every sticky element in the app at one viewport, so it had to be fixed before the battle
screen's own region could work at all. `min-height` is the fix.

**Then one sticky region replaced three**, pinned at the app header's MEASURED height. The Header
publishes `--app-header-h` itself, because the number is not knowable in CSS: two rows inside a
section, one on `/`, and either wraps at narrow widths. Cumulative offsets were the alternative and
the wrong one — three numbers already known to change.

Measuring it properly mattered twice. `offsetHeight` published **91px against a real 96px**, because
the rows measure 60.5 and 34.5 and two truncations compound; and the value published at mount was
stale because **web fonts change the row heights after first paint**, which a `ResizeObserver` alone
did not catch. So it measures `getBoundingClientRect`, rounds up, and re-publishes on
`document.fonts.ready`.

**Verified in a browser after a 1200px scroll**: 4 sticky regions became 2, three overlapping pairs
became **zero**, and Advance, Undo and the tablist are all visible where they were fully occluded.

The constraint on any fix: the offsets cannot be hardcoded. The scoreboard's title wraps, the
controls wrap, the quick-reference chip row appears and disappears, and the app header is two rows on
most routes and one on `/`. So cumulative offsets would be three numbers that are already known to
change. One sticky region rather than four is the shape that needs no numbers kept in sync.

**How it got here, because the reasoning was not absent — it was answering the wrong question.** KF4c
added two sticky regions, KF5 added the tablist, KF7 B put the chip row inside the controls. Every
one of those steps reasoned carefully about the HEIGHT budget and none about whether `sticky`
stacks. The budget argument was real and it was not the question.

### The current stage loses to the one you are advancing to — FIXED (slice 1)

Found in the same phone preview, and the diagnosis matters because it has two causes.

The current stage IS on screen — `gameStateLabel` renders `TP 2 · firefight` into the scoreboard's
`Eyebrow`. But an eyebrow is `font-size: 10px`, `color: var(--faint)`, letter-spacing 0.28em, while
the button naming the NEXT stage is 11px with 11px padding inside a bordered control. So the
loudest text on the screen names the stage a player is going TO, and the quietest names the one they
are IN. "Advance to firefight" then reads as a statement rather than an action, which is exactly how
it was reported.

And it may not have been visible at all: the eyebrow sits in the scoreboard, which is pinned
underneath the app header by the overlap above — the same strip that was covering "Raveners". So fix
the overlap first and judge the hierarchy after, or the symptoms get chased instead of the cause.

The hierarchy is wrong either way. A 10px faint label against an 11px bordered button misorders the
one fact a player needs at a glance, and the state is already derived, so this is presentation only:
promote the current stage to real weight near the title, and demote the control relative to it.

Fixed by promoting the stage rather than touching the control: it was an `Eyebrow` at 10px and
`--faint` and is now 15px in `--ink`, beside the back link above the title.

**The label itself is not the bug.** KF4c chose a button naming its destination over a bare
"Advance" deliberately, and `advanceFinishes` exists so that copy cannot drift into load-bearing.
What is wrong is its prominence relative to the current state — which is the same accident as KF7
B's section order: two elements added by different slices for different reasons, with nobody ever
comparing their weights.

### The scoreboard gets out of the way — BUILT (KF8d)

**This replaces `KILLTEAM.md`'s "always visible".** That document (`KILLTEAM.md:574`) asks the battle
screen for turning point, CP and VP always on screen, and it now hides on the way DOWN and returns on
the way UP. **The backend repo's design reference still carries the old wording and needs updating** —
recorded here because a requirement changed in one repository and owed by another is the shape of
defect this roadmap has found twice.

**The measurement that justifies it** came from KF9, which is also why KF9 was built first: the
pinned chrome reached **481px of a 664px viewport — 72%**, leaving 183px, barely one collapsed
operative row. While scrolling down it is now **339px, 51%**.

**The decision is separated from the wiring**, and the split is not stylistic.
`src/lib/chromeScroll.ts` holds the thresholds as ordinary arithmetic with eight jsdom tests; the
listener lives in the view. jsdom fires no scroll events and lays nothing out, so the wiring is
observable only in KF9 — which is the whole reason this slice waited for that one.

Three behaviours, each a threshold with a reason:

- **It will not hide until the scoreboard has been scrolled wholly past.** Tucking away something
  half-visible reads as a glitch rather than as a response.
- **It returns on the first upward movement, at any depth, with no threshold of its own.** This is
  the half that makes the information reachable rather than merely absent.
- **Movement under 8px decides nothing** — a finger resting on a phone jitters, and a trackpad
  scrolls sub-pixel. `lastY` is NOT advanced when a move is ignored, so a slow drag still accumulates
  to a decision instead of being discarded a pixel at a time.

It translates by the scoreboard's own measured height rather than collapsing a height, which keeps it
off the layout path: nothing below reflows. Under `prefers-reduced-motion` it still hides — the point
is the space, not the movement — it simply arrives rather than travels.

**KF9 caught a defect that would otherwise have shipped silently.** The view returns early while the
game loads, so the chrome does not exist on the first render and the ref is still null when the
effect first runs. A ref object is stable, so with `[ref]` as the dependency the effect never ran
again and **the listener was never attached** — the feature did nothing at all, and every jsdom test
still passed. It now depends on readiness as well.

**Three of the four assertions written for it were wrong in ways only a browser showed.**
Playwright's `boundingBox()` answers in a different coordinate space than `getBoundingClientRect()`,
so the file disagreed with itself about where the scoreboard was. The page could not reach an exact
scroll target — asking for 700 landed on 698, because tucking the chrome changes the document height
and so the maximum scroll. And a settle check that waited for "unchanged across two frames" passed
instantly on a value that had not started moving, because the scroll decision is itself made in a
`requestAnimationFrame`.

**One assertion had to be re-scoped rather than fixed.** "No two pinned regions overlap" began
failing correctly: the scoreboard now deliberately slides behind the app header, which is an overlap.
It measures after scrolling down AND back up, so it still carries the claim KF8a was about — when
every pinned region is meant to be on screen, none occludes another.

### Operative rows and sections collapse — BUILT (slice 4)

Reported in the same session: a player looks at one operative, or one section, at a time, so the rest
should be possible to put away. The same instinct that drove KF7 B's per-entry collapse, one level
out — and it reduces the problem above directly, since less open content means less scrolling past a
sticky region.

**Measured first, at a 390px content width.** Chrome will not make a window narrower than ~566px of
viewport, so `#root` was constrained instead; the `max-width: 640px` phone stylesheet was already in
force at 566px, so this changed wrapping and not which rules apply. It is not a cosmetic difference —
the per-operative control strip measures **35px at 566px and 80px at 390px**, because it wraps.

| band | height |
|---|---|
| app header | 128px (two rows at narrow width; 96px at desktop) |
| sticky chrome — scoreboard 142, controls 100, tabs 38 | 309px |
| **chrome before any content** | **437px of an 844px phone — 52%** (corrected: see KF9) |
| one operative row | 241px |
| **rows that fit below the chrome** | **1.7** |

A six-operative battle ran to 3,008px. Thirteen operatives — the largest in the dev database — is
3,133px of rows alone, 3.7 phone screens.

**The 844 is wrong, and KF9 found it.** 844 is the iPhone 14's DEVICE height; Safari's own chrome
takes about 180px of it, so the VIEWPORT a page gets is 664px. Measured in WebKit, the pinned chrome
reaches **481px of 664px — 72%**, leaving 183px, which is barely one collapsed row. Every phone
figure recorded before KF9 was against the device height and understates the problem by the same
factor. The rows measurements are unaffected: a row's height does not depend on the viewport.

Where a row's 241px went: controls 80, padding and gaps ~70, token editor 41, datacard summary 31,
name 19.

**What collapses, and what MUST NOT.** `KILLTEAM.md`'s Frontend section asks the list to stay
"compact enough to see the whole team at a glance — name, wounds, order, activated". None of those
four is text on this screen: wounds and order ARE their controls. So a collapsed row keeps the whole
control strip — wounds, order, Activate — and folds away the two parts a player reads occasionally
rather than every activation: the tokens and the datacard. Collapsing the controls would have broken
the requirement collapsing was meant to serve, and `killTeamGameRow.test.tsx` asserts against it.

Sections default by how often they are touched, which is the argument KF7 group B used to order them:
Operatives, This turning point and Score and command open; Equipment, Killzone and Choices folded.

**`aria-expanded` with conditional rendering, not `<details>`**, for two reasons that are both
specific to this screen. It re-renders on every write, and `open` is a DOM attribute React re-applies
each render — the trap `KillTeamRosterView`'s `RosterComposition` already records in code. And a
closed `<details>` keeps its children in the DOM, so the height saving would be partly a lie; here a
closed section is genuinely not rendered, which is also the only form the suite can check.

**Verified in a browser at the same 390px content width**, on the six-operative battle the
baseline was taken from:

| reading | before | after |
|---|---|---|
| one operative row | 241px | **145px** (−40%) |
| whole page | 3,008px | **2,145px** (−29%) |
| a folded section | — | 19px, body absent from the DOM |
| 13 operatives, projected | 3,133px | **1,885px** |

The collapsed row reads `+ 1 Traitor Chieftain · NOT ACTIVATED · − 8/8 + · ENGAGE CONCEAL ·
ACTIVATE` — all four of the at-a-glance facts, with wounds and order still operable. Opening a row
returns it to 241px and leaves every other row closed; opening Killzone takes its section from 19px
to 72px and its body from absent to present. No horizontal scroll at any point.

**What did NOT improve: the control strip is still 80px**, because it still wraps to two lines at
390px. It is now more than half of a collapsed row, so it is where the next saving is if one is
wanted — shortening the order toggle is the obvious candidate, and it was left alone here because a
two-button segmented control says what both options are and a single flip-button does not.

**The disclosure button went INSIDE the `<h2>`.** The heading and its id have to survive:
`aria-labelledby` points at it, and the battle tab's order is asserted through
`section[aria-labelledby]`. `InventoryView` solves the same problem by replacing the heading with a
bare `<button>`, which loses the document outline — a test asserts the heading is still an `h2` and
still carries its id.

### Why these escape every gate this repo has

`jsdom` implements the DOM and parses CSS; it does not lay anything out. Measured: an element
declared `position: sticky; top: 0; height: 120px` reports `computedPosition: "sticky"` and
`computedTop: "0px"` — the values it was GIVEN — alongside a bounding rect of `0x0` and
`offsetHeight: 0`. So jsdom knows what was declared and nothing about what it does.

That one fact explains three defects found by eye rather than by test: these overlapping sticky
regions, the 16px auto-zoom, and tap targets under 44px. None is reachable from a suite without a
layout engine.

**Corrected (slice 4): a closed `<details>` was listed here as a fourth, and it does not belong.**
Its content is indeed still returned by `queryByText`, which is what the entry meant. But
`expect(el).toBeVisible()` DOES understand `<details>` — measured in this suite, false when closed
and true when open — so the state is assertable, just not with a `queryBy*`. The repo's existing
convention of reading `.open` was therefore never the only option.

What a real engine WOULD catch, if one were added: two sticky regions intersecting after a scroll (a
rect comparison), a control's rendered height under 44px, and content inside a closed disclosure
having zero height. What it still would NOT catch is the 16px zoom — that is an iOS Safari keyboard
behaviour, not a geometry fact, which is why KF8 states it as a static CSS rule instead.

---

## KF9. A deliberately tiny browser suite

**Status: BUILT, and deliberately NOT in CI.** `npm run test:browser` — 7 tests from 4 assertions,
one spec file, one viewport. Run it while working on layout; nothing gates on it.

**It paid for itself on the first run**, which is the only evidence that matters for a decision
this entry spent its length hedging:

1. **The viewport is 664px, not 844px** — see the correction in KF8c above. Every phone measurement
   this roadmap carried was against the device height, so the pinned chrome is 72% of what a player
   sees rather than 52%.
2. **Twelve buttons under 44px that KF8b's static test structurally cannot see.** It checks the five
   primitives' stylesheets, and these bypass the `Button` primitive: the operative row's own
   disclosure at 22px (eight of them) and the victory-point source remove buttons at 13px.

**Playwright's own runner rather than `@vitest/browser`**, which is what this entry originally
sketched. Viewport, touch emulation and scroll control are first-class in Playwright and awkward in
vitest's browser mode, and the suite is nothing but viewport, touch and scroll.

**Three things nearly made it a suite that measures nothing**, each found by deliberately breaking
the app rather than by a green run:

- `browser/layout.spec.ts` matches **vitest's** default `*.spec.ts` include, so vitest collected it
  and reported "1 failed file, 0 failed tests" — a main suite broken by a file that is not its.
- The suite's TypeScript was **unchecked**: `tsc -b` skipped it, eslint caught only an unused
  variable, and Playwright strips types without checking them. It now runs `tsc -p
  tsconfig.browser.json` before the tests, so a type error stops the run.
- Waiting on a VISIBLE element made a layout defect report itself as a 20-second timeout on an
  unrelated control, because a wrongly pinned chrome covers the thing being waited on. It waits for
  `attached` instead, and the same mutation now fails in under a second with the overlap listed.

**Verified by making it fail.** Reintroducing KF8a's `top: 0` produced three overlapping pairs;
removing `Button`'s coarse-pointer rule added `_button` to the short list; forcing a 520px minimum
width reported 130px of sideways scroll on two routes.

**Two ratchets rather than two aspirations.** The chrome budget is set at the measured 72% and the
tap-target list is pinned at the two known offenders, so both can only improve: fixing one fails the
test until the list shrinks, and a new offender fails it immediately. A gate that fails the day it
lands teaches people to skip it.

**Assertion 5 was dropped before it was written.** It was to replace the suite's 12 `.open`
assertions, and those are not proxies — `expect(details.open).toBe(false)` answers exactly the
question it asks. What they cannot see is whether the CONTENT is hidden, and `toBeVisible()` does
understand `<details>` in jsdom, so that gap needs no browser.

**The rule this session paid for, now written down: every geometry probe records
`document.visibilityState`.** An automated tab is hidden by default, and a hidden tab runs no
rendering lifecycle — no `requestAnimationFrame`, no `ResizeObserver`, no scroll events — while
`getBoundingClientRect()` still returns real numbers because it forces layout on read. That
asymmetry produced one finding that was committed and withdrawn, and a second that was caught before
it was. It is also why the MCP browser harness cannot verify KF8d at all, and why KF9 came first.

**The one honest argument for it.** `KILLTEAM.md` asks the battle screen for "turning point, CP and
VP **always visible**", and `KillTeamGameView.tsx`'s own header admits that claim is "verified by
eye" because `position: sticky` cannot be asserted here. 580 tests say nothing about the requirement
the screen exists to satisfy. Everything else below is a nice-to-have; this is the part that is
currently unverifiable.

**Why jsdom cannot do it.** Measured: an element declared `position: sticky; top: 0; height: 120px`
reports `computedPosition: "sticky"` and `computedTop: "0px"` — the values it was given — with a
bounding rect of `0x0` and `offsetHeight: 0`. jsdom implements the DOM and parses CSS; it lays
nothing out, so it knows what was declared and nothing about what it does.

### Scope: five assertions, one file, one viewport

390 × 664 — the iPhone 14's VIEWPORT, not its 844px device height — driving **WebKit**, because
testing sticky behaviour in Chromium and
shipping to iPhones tests the wrong engine. It renders a seeded screen and measures boxes: it never
signs in, never creates a battle, never asserts on copy.

1. **After scrolling, no two pinned regions' bounding rects intersect.** Four sticky regions exist
   today and three of them overlapped for three slices before a phone preview found it.
2. **The chrome above the first operative is under a budget** — say 45% of the viewport. That is
   "phone-first, for use at the table" as a number.
3. **Every rendered button is at least 44px tall.** Apple's minimum; `Button` is roughly 35px today
   and its small variant roughly 25px.
4. **`document.scrollWidth <= clientWidth` on each main route** — "no horizontal scroll", from KF8's
   checklist, promoted to a gate.
5. **Content inside a closed `<details>` has zero height.** This replaces a tax already being paid:
   the suite carries **12 assertions on the `open` attribute** and **6 comments** explaining that
   jsdom does not hide a closed disclosure, written three separate times (KF4e, KF5, KF7 B). Each is
   a proxy for the thing it actually cares about.

**The discipline that keeps it tiny:** every assertion must name a requirement from `KILLTEAM.md` or
this roadmap. If it cannot, it belongs in jsdom or nowhere. Every browser suite starts as "just a few
layout checks"; that rule is the only thing that stops this one growing into a slow second suite
duplicating what jsdom already covers well.

### What it would NOT buy

- **The 16px auto-zoom**, which is an iOS Safari keyboard behaviour and not a geometry fact. It stays
  a static CSS rule in KF8.
- **Appearance.** No screenshots, so "does it look right" remains someone's eyes. Visual regression
  is a different and much larger commitment.
- **Real touch** — momentum scrolling, or the address bar collapsing and changing `vh`.
- **Anything about correctness.** The existing suite stays the one that matters for behaviour.

### The cost, against this repo's stated stance

`src/styles/cssModules.test.ts` says the dependency list is "deliberately tiny" and walks the tree
with `node:fs` rather than add a glob library. The totals today are **5 runtime dependencies and 21
dev**. This would add `@vitest/browser` and a Playwright provider, a **WebKit binary of roughly
100–300 MB** to install in CI, a second vitest config (jsdom and browser mode cannot share one), a
dev server running during the run, slower CI, and a new flakiness class in scroll settling.

Scoped to five geometric assertions that each name a requirement, that looks like a fair trade.
Scoped as "test the app in a real browser", it is not.

---

## F12. The 40k half, from using it

**Status: Not started.** Reported from use, like KF7 and KF8 were. The `F` series rather than `KF`
because this is the army-list half.

### Adding from the catalog offers the whole catalog

Opening "add from catalog" from an army shows every unit in the database — **1,331** of them, the
figure `docs/api/conventions.md` uses — with no constraint to the army's faction.

**Everything needed already exists**, so this is wiring rather than capability. `Army_Read` carries
`faction_id` AND `subfaction_id`; `Unit_Read` carries both; `GET /units` accepts both as filters; and
`CatalogView` already sends `faction_id` to that filter from its left rail. What is missing is that
`ArmyCatalog` passes only `target={{ kind: 'army', armyId }}` and never the army's faction, while the
view initialises `factionId` to a sentinel meaning "all factions".

**Measured in a real browser, against a Space Marines army**, and the screen is worse than
"unfiltered":

- Its own eyebrow reads **"ADDING TO AUDIT SPACE MARINES"**, so it knows the destination army.
- The faction rail shows **All units 1332** selected, with **Space Marines 267** one row beneath it,
  unselected.
- The first six units offered are Chaos, Xenos, Xenos, Imperium, Imperium, Chaos. **Not one Space
  Marine unit appears on the opening page of a Space Marine army's "add from catalog".**

**So the fix is smaller than this entry first assumed.** The rail already drives the query and
already has the right faction in it; nothing needs passing through `CatalogView`. What is needed is
that `factionId` initialises from the target instead of from the all-factions sentinel.

**The consequence is the serious half, and it is the reason this is not cosmetic.** This app does
bookkeeping and not rules — it will not tell anyone a list is illegal. So an unfiltered catalog does
not merely add noise: it IMPLIES those units are available to that army, and nothing downstream will
contradict it. The eyebrow makes that worse rather than better — a catalog that did not know the army
would merely be unhelpful; one that announces the army and then offers Chaos units is asserting those
are available to it.

That is the same failure as the "Opponent" field promising a join that did not exist, and it is now
the third of its kind: cheap to build, and a claim to the user that no other layer will correct.

**Decided and BUILT (slice 3): the catalog opens on the destination army's `faction_id`.** It
DEFAULTS rather than locks — the rail stays fully usable, and no extra control was needed to clear
it, because an unchosen filter and a filter set to "All units" are kept as distinct states.

**Verified in a browser against `Audit Space Marines`**, the same army the original symptom was
measured on:

| reading | before | after |
|---|---|---|
| count | `25 OF 1332` | `25 OF 267` |
| rail selection | All units | Space Marines |
| first six rows | Chaos, Xenos, Xenos, Imperium, Imperium, Chaos | six Space Marines units |

Clicking "All units" returns 1,332 and clicking Chaos returns 253, so the default is a default.

**Keywords were investigated first and the data does not support them.** This entry briefly recorded
a decision to match on faction keywords. Counts from the local dev database on 2026-10-21:

| probe | result |
|---|---|
| distinct keywords across 1,332 units | 1,216 |
| subfaction names appearing as a keyword | **2 of 34** — `Aeldari` (113), `Deathwatch` (9) |
| `Adeptus Astartes` anywhere | **1** unit |
| faction names as keywords | only `Imperium` (645) and `Chaos` (244) |
| units with `[]` keywords | 44 |

The scraped arrays hold battlefield-role and ability keywords — `Infantry`, `Character`, `Vehicle`,
`Grenades`, `Smoke`, `Fly` — plus the unit's own name echoed back. Four Black Templars units read
`["Infantry", "Character", "Grenades", "Imperium", "Tacticus", …]` with no chapter keyword at all,
and `armies` has no keywords column to compare against. Matching on them would select on `Imperium`,
offering a Black Templars army roughly 645 units — **worse than the 267** the faction gives — and
would hide the 44 units that carry none.

**`subfaction_id` is NOT applied yet, deliberately.** The backend filter is an exact match
(`warhammer_unit/app/core/services/service_unit.py:161`), which excludes units carrying no
subfaction. Space Marines is the only faction with any — 141 of its 267 — so an Ultramarines army
would be offered **13** units and could not add an Intercessor Squad.

| filter | units offered to an Ultramarines army |
|---|---|
| `faction_id`, as built | 267, including 126 belonging to other chapters |
| `subfaction_id` | 13, losing all 141 generic units |
| generic + chapter | 154, and no single request returns it |

Over-offering is the safe direction for an app that does bookkeeping and not rules: it never hides a
legal unit. **The remaining step is a backend predicate** — `subfaction_id IS NULL OR subfaction_id =
:id` — after which the frontend can pass the army's subfaction too. Four of the seven armies in the
dev database carry no subfaction at all, so that path MUST keep working when the column is null.

### Showing every option an army can use — decided, not built

**Status: Planned.** Decided 2026-10-21, then parked: the focus moves to Kill Team. The goal stated
for it is completeness — a player seeing every unit they can use with the army they chose.

**The faction default built in slice 3 is a partial answer, and only Space Marines benefits much.**
Counts from the local dev database, for the armies that exist in it:

| army | catalog shows | actually usable | unusable rows shown |
|---|---|---|---|
| testarmy — Tyranids | 500 | **39** | 461 (92%) |
| test army — Adeptus Custodes | 311 | **29** | 282 (91%) |
| Audit Space Marines — no chapter | 267 | 141 | 126 |
| Ultramarines, hypothetical | 267 | 154 | 113 |

Generic units exist ONLY under Space Marines — 141 of its 267, and zero in every other faction. So
`faction` behaves as a shared pool there and as a container for unrelated armies everywhere else,
which is why one filter cannot serve both without the subfaction.

**The rule** is `faction_id = army.faction AND (subfaction_id IS NULL OR subfaction_id =
army.subfaction)`.

**Four decisions, all taken:**

1. **The rule lives in the backend, as its own operation** — `GET /me/armies/{id}/available-units`.
   Services own business logic in this architecture, and a rule the frontend derives is one the next
   caller re-derives differently. The alternative considered was extending `GET /units` with an
   `include_faction_generic` flag, which is smaller and leaves the rule split across two repositories.
2. **An army with no subfaction sees the 141 generics, and is prompted to choose a chapter.** Four of
   the seven armies in the dev database have no subfaction, so this is the common case rather than an
   edge. Showing all 267 was the alternative, and it offers units from eleven chapters as though they
   were interchangeable.
3. **Allies are out of scope, and the entry MUST say so.** Imperial Agents (43), Imperial Knights
   (23), Chaos Daemons (103) and Chaos Knights (20) ally into other armies in the game, and the
   schema has no allies table. The taxonomy also forbids the obvious case: this data models **Space
   Marines as a top-level faction beside Imperium**, not beneath it, so no faction rule can let a
   Space Marines army reach Imperial Agents.
4. **The set is made legible, not merely correct.** The rail gains a second level — `Core <faction>`
   beside the subfactions — and the count line states the composition rather than a bare total, for
   example "154 available to Ultramarines · 141 core + 13 chapter". Together these answer the goal:
   the player sees what is included, why, and can still click up to the whole faction.

**Rejected: show everything and mark the rest.** It is the most consistent with an app that does
bookkeeping and not rules, and at 92% noise for a Tyranids army it means scrolling 461 unusable rows
to reach 39.

**Rejected: two client queries merged.** `total` and paging would be computed over a set the server
did not produce, which is the failure `CatalogView`'s own comment already records — filtering and
pagination have to happen on the same side.

### The catalog says which edition it is — BUILT

A note under the catalog's title: the app targets Warhammer 40,000 10th edition, and the list is
narrowed by faction keyword rather than checked for legality. Without it a filtered list reads as an
availability check, which is a claim this app does not make and cannot keep — the same false-promise
failure as the "Opponent" field and the unfiltered catalog itself.

### Two gaps a static audit found, in the oldest 40k screens — FIXED (slice 3)

Not reported from use — turned up by walking every route against the states it handles.

**`/army-list/catalog` has no error state at all.** Zero matches for `isError`, `role="alert"` or any
error copy, on the view that runs **four** queries (factions, inventory, units, facets) and therefore
has the most ways to fail. Every other data-backed view in the app handles it; this one predates the
convention the Kill Team views follow. It is also the screen the faction-filter gap above is on,
which is not a coincidence: it is the oldest and busiest view in the 40k half.

**FIXED (slice 3): two `role="alert"` regions, not one.** The units failure replaces the rows; the
faction failure renders inside the rail and leaves the units alone, because a rail that did not load
is not a catalog that did not load.

**The units branch MUST sit above the empty check**, which is the part worth keeping. A failed fetch
also leaves the list empty, so below it the screen reported a server fault as "No units match." —
blaming the player's search for it. The test asserts the ABSENCE of that copy, not only the presence
of the alert, because a branch in the wrong order still renders an alert on some other path.

**What it does not cover: an unreachable server.** See the next subsection.

**`/army-list` announces nothing while it loads.** `CollectionView`'s skeleton rows and cards are
marked `aria-hidden="true"` — correct on its own — but there is no `role="status"` beside them, so a
screen reader is told nothing between request and render. Every Kill Team view pairs the two.

`aria-busy="true"` was already on the container and does not help: it marks a region as updating and
announces nothing. The hidden skeletons are the one element that CANNOT carry the announcement, so
the fix is a visually-hidden line inside a `role="status"` wrapper.

**FIXED (slice 3) and verified in a browser** on a slowed response: the region carries the accessible
name `Loading armies` and the text "Loading armies…", the four skeletons all sit inside an
`aria-hidden` subtree, and the region disappears once the armies render. That last check matters — a
status region that survives its own load keeps announcing a load that finished.

### A query paused in a hidden tab — WITHDRAWN, the measurement was the bug

**Status: Not a defect.** Recorded here rather than deleted, because the wrong version was committed
and acted on, and the way it was wrong is the useful part.

**The claim was** that an unreachable API suspends a query rather than failing it, leaving
`/army-list/catalog` on "Loading units… 0 OF 0" indefinitely, with a `networkMode` decision attached.
The readings were real: `status: pending`, `fetchStatus: paused`, `failureCount: 0`, with native
`fetch`, a genuinely stopped server and `navigator.onLine` reporting `true`.

**The cause was the probe.** Every measurement ran against a BACKGROUND tab —
`document.visibilityState` was `hidden` — and React Query deliberately stops retrying in a tab nobody
is looking at. Three lines of its source account for all four observations:

| `node_modules/@tanstack/query-core/src/retryer.ts` | |
|---|---|
| `canStart()` (line 109) | `canFetch() && canRun()` — no visibility check |
| `canContinue()` (lines 104-107) | `focusManager.isFocused() && (networkMode === 'always' \|\| onlineManager.isOnline()) && canRun()` |
| line 196, after a failure | `canContinue() ? undefined : pause()` |

And `focusManager.ts:81` defines `isFocused()` as `document.visibilityState !== 'hidden'` — so it
tests VISIBILITY, not the network and not window focus.

That asymmetry between `canStart` and `canContinue` reproduces every symptom with no network
involvement. The first request ran although the tab was hidden, because `canStart` ignores
visibility. The retry paused, because `canContinue` does not. It stayed paused when the server came
back, because the tab was still hidden. And clicking a faction appeared to "recover" it because that
creates a NEW query key, which goes through `canStart` again.

**So the real behaviour, for a player whose tab is visible, is the intended one:** the request fails,
`canContinue()` is true, three retries run at 1s/2s/4s, and the alert from the entry above renders.

**What this cost, and the rule it earns.** "Native `fetch`, real dead server, `navigator.onLine`
true" was offered as proof the finding was real. Each was true and none was the variable the code
tests first. A browser probe MUST record `document.visibilityState` alongside whatever it is
measuring, because an automated tab is hidden by default and that silently changes retry, refetch and
focus behaviour across every query in the app.

**`networkMode` therefore needs no decision for queries.** The default `'online'` already produces
the error state for a visible tab, and for a genuinely offline browser, pausing is the better
behaviour.

### Paused mutations replay against a version they did not read

**Status: Planned.** The narrower question that survives the withdrawal above, and it is about writes
rather than reads.

Under `networkMode: 'online'` a write attempted while the browser is offline is paused and queued,
then replayed on reconnect. The app has **31** `useMutation` call sites — 14 in
`src/api/killTeamGamesQueries.ts` alone — and no reference anywhere in `src/` to `networkMode`,
`onlineManager`, `focusManager` or `resumePausedMutations`, so every one of them takes that default.

**It meets the battle screen's concurrency design head-on.** `versionFrom`
(`src/api/killTeamGamesQueries.ts:75`) reads the version to assert at SEND time rather than at
`mutate()` time, which is correct for a write that goes out immediately. A paused write sends
whenever it is resumed, so it asserts whatever version the cache holds then — possibly after the
opponent has advanced the game.

The principle it sits against is `#78`: re-read and **re-decide**, never retry. A queued write that
replays silently is a retry of a decision the player made against a board that no longer exists.
Whether that is a real hazard depends on timing nobody has measured yet.

**Not measured, and the measurement MUST state `document.visibilityState`.**

### One action, three treatments — FIXED (slice 3)

**One treatment now: `dangerOutline` opens the dialog, `danger` confirms inside it.** The pair is the
point. `Button`'s own comment already said `danger` exists so a destructive confirm does not look
like "Create"; a filled TRIGGER collapses that distinction one level up, and `ghost` made Delete the
faintest control on the page. `dangerOutline` mirrors `secondary`, this kit's idiom for a bordered
button that fills on hover. Verified in a browser: `DELETE ARMY` computes to `rgb(178, 58, 46)` text
and border, which is `--danger`.

**A bug came out with it.** `KillTeamGameView`'s confirm button carried the local class and NO
variant, so it rendered as `primary` — an ink fill — with only `color` overridden: red text on a
black background. It type-checked and it rendered, and it was wrong only to the eye.

`src/views/destructiveActions.test.ts` holds the decision: each screen opens with exactly one
`dangerOutline` trigger, confirms with `danger`, and passes no class to a `Button` that re-colours
it. That last rule is scoped to BUTTONS on purpose — `ArmyView` gives `.overTag` and `.issueKind` red
text and a red border legitimately, because those are `<Tag>` badges where red IS the meaning, and a
first version of the rule flagged both.


The delete control is styled differently on every screen that has one, and the 40k one is the
hardest to find:

- **`ArmyView`** — `variant="ghost"`, which is `color: var(--muted)` and nothing else. No border, no
  background, faint grey text. The red only appears on the confirm button INSIDE the dialog, which is
  where it was noticed. Seen on screen, `DELETE ARMY` is the least visible control on a page that
  renders `+ ADD FROM CATALOG` twice, once as a solid black bar — so the destructive action has the
  least weight of anything there.
- **`KillTeamRosterView`** — `variant="danger" size="sm"`, a filled red trigger.
- **`KillTeamGameView`** — `variant="secondary"` with a local `.danger` class, so a bordered button
  with red text and a red border.

There is a real trade-off underneath, which is why this is recorded rather than assumed: a faint
trigger for a destructive action is defensible — it is hard to hit by accident, and `Button`'s own
comment says the emphasis belongs on "the button in a dialog whose title asks the question". But
`ghost` tips that into undiscoverable, and three treatments for one action means nobody decided; each
screen chose locally. Pick one and apply it to all three.

---

## The plan of record

Everything open, sequenced. The ordering is by **screen and file**, not by the order things were
reported: several reported items share a stylesheet, and one of them changes what another is measured
against. Sequencing purely by "what hurts most" would mean editing
`KillTeamGameView.module.css` in three separate slices.

Each slice updates its own entry in the same commit as the code (see KF7's maintenance note), and
each is verified in a real browser against the `audit_bot` test account on the local database — not
only by the suite, since every defect in slices 1 and 4 is invisible to jsdom.

| # | Slice | Contents |
|---|---|---|
| 1 | **KF8a — the battle screen's chrome** — BUILT | One sticky region replacing four; promote the current stage and demote the advance control relative to it |
| 2 | **KF8b — three rules and the test** — BUILT | 16px controls, 44px tap targets, `prefers-reduced-motion`; a static CSS test; four stylesheets needing a phone block. Nine navigation links stay under 44px by design — see the KF8 subsection |
| 3 | **F12 — the 40k half** — PART BUILT, PARKED | Built: catalog error states, `CollectionView` live region, the faction default, one delete treatment, the edition note. Decided but not built: `available-units` as a backend operation, the two-level rail, the composition count. Parked — the focus moves to Kill Team |
| 4 | **KF8c — collapsing** — BUILT | Operative rows and sections collapse. Rows keep wounds, order and Activate visible, per `KILLTEAM.md`'s at-a-glance requirement; tokens and the datacard fold away |
| 5 | **KF7 D** — BUILT | Initiative in "This turning point", whose lifetime it shares (#62); board status in the operative row's folded half, with `incapacitated` left derived |

**Why 1 and the hierarchy go together.** The overlap and the stage-versus-button weights are the same
strip of screen and the same stylesheet; fixing one then revisiting the other is two passes over
identical rules.

**Why 4 comes after 1.** Collapsing changes how much content scrolls past the sticky region, so
measuring the sticky fix against content that is about to change would be wasted.

**Why 2 is worth protecting if effort gets cut.** It is the only slice that leaves the codebase
measurably harder to regress. The others fix specific defects, which stay fixed; those three rules
have already drifted once.

### Decisions these need, and who owns them

- **Slice 3**: all three are settled and built — the filter defaults to the army's `faction_id`, the
  delete treatment is `dangerOutline` with a `danger` confirm, and `networkMode` needs no decision
  for queries. What is left is the backend's `subfaction_id` predicate, and measuring paused-mutation
  replay.
- **KF9**: whether the browser suite is adopted at all.
- **F8**: the deploy step needs a Firebase credential as a repository secret.

### Outstanding but not schedulable here

**KF6** is blocked until the backend publishes its events, invite and join operations. Two asks of
the backend are recorded rather than raised: drop `events` from `KTGame_Read` (56 kB on a long
battle, for a log no player sees) and return the new version or an `ETag` on a write response, which
has now dictated client behaviour in two opposite directions. **F4** is unblocked — its stated
dependency landed — and needs scoping rather than a decision.
