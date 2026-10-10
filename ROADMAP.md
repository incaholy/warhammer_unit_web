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

**Status: Not started.** Roughly nine endpoints, at `/kill-team/games` and `/kill-team/games/:id`.
This is the screen the feature exists for, and `KILLTEAM.md`'s own Frontend section specifies it:
**phone-first**, for use at the table. Large touch targets, one card per operative, and turning point,
CP and VP always visible.

**Two levels of detail**, both required: a compact list showing the whole team at a glance (name,
wounds, order, whether it has activated), and any card opening to the full datacard as printed, for
mid-activation lookups.

**The game read needs no catalog call, ever** (#22, #24). It carries the whole snapshot — every
datacard, the team's rules, its ploys and the universal ones, the text of each piece of equipment
taken — and the snapshot never invalidates, because it is static for the game's life. So the detail
query is fetch-once and the screen reads the snapshot, not the catalog API.

**Three state rules the UI derives rather than reads:**

- **"Has it activated?" is a comparison**, not a flag: `activated_in_turning_point` against the game's
  own `turning_point`. `advance` clears nothing (#61).
- **`initiative: null` renders "not rolled"**, never as the opponent's. `advance` resets it to null
  each turning point (#62).
- **Every write is an absolute value**, never a delta — `wounds: 7`, not `-2` — for retry safety (#7).

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

## KF5. Run a battle: the reference and the log

**Status: Not started.** Roughly six endpoints, completing the game screen. `KILLTEAM.md` describes a
**team tab** holding the rest of the reference: the kill team's rules, its ploys with CP costs, and the
equipment picked for this battle — read-only, from the snapshot, with current state shown beside the
stats it started with. "A reference sheet and a status sheet at once."

**Equipment is per game, not per roster** (#17), revealed during play with
`PATCH .../equipment/{row_id}`. The game read carries `equipment_limit` beside the pieces taken — the
same shape as `Army_Read`'s `points_limit` beside `points_total` — and **the fifth piece is accepted**
(#57). The allowance is displayed, never enforced: *"a frontend that had to hard-code 4 to warn a
player would be holding a rule of the game."*

**Revealing equipment does not add the operatives it grants.** The client reveals the piece, then adds
the datacards — four generic calls, not one special one. Settled, not pending.

**Spending a ploy is one operation** (#65): `POST .../ploys` with a name. The server reads `cp_cost`
from the game's own snapshot and deducts it in the same event, so one undo restores both the CP and the
log entry. The client must not send a cost. A ploy the snapshot does not list is refused, and so is one
the CP will not cover. How often a ploy may be used is shown, not counted.

**Transform happens in place** (#19): same row id, same tokens, order and board status; the catalog
pointer moves and the datacard is re-snapshotted. It is the same miniature on the table, so the screen
needs nothing new — and because both `add` and `transform` are event-logged, the log can show what a
model used to be (#18).

**Undo, and no redo** (#8). An event payload names the fields it touched with their `before` and
`after`; `undo` writes the `before` values back, appends a compensating event, and marks the original
`undone_by` — so the log stays append-only and each further undo walks back to the newest
not-yet-undone event (#58). The UI can therefore render the log and identify what has already been
reverted.

**A finished game is closed to edits but fully readable, and `undo` is the way back out** (#66). There
is no `reopen` route: undoing the event that finished the game reopens it. Deleting a finished game is
allowed. A write to one answers 400 on the `status` field.

**Open, and closed here:** the shape of `choices{}` — the per-game picks the rules leave to the
players, a chosen Tac Op beside the Accursed Gift, free-form by #59.

**Still deferred:** no redo, by #58. No Tac Ops or archetype gating, by #59 — gating a choice by
archetype would be applying a rule, which #1 puts out of scope.
