# Code review, frontend (`warhammer_unit_web`)

The companion to [`CODE-REVIEW.md` in the API repo](https://github.com/incaholy/Warhammer-unit/blob/main/CODE-REVIEW.md), which covers the backend findings.

**Status: this is good code.** 144 tests pass, lint is clean, the build produces properly code-split chunks. The structure is right: one HTTP client that owns the token and error shape, TanStack Query with hierarchical keys and precise invalidation, route-level lazy loading, an error boundary, real accessibility work (progress bars with `aria-valuetext`, skeletons as polite `status` regions, labelled controls). No `any` in application code, no `dangerouslySetInnerHTML`, and only three `eslint-disable` lines, each with a stated reason.

**And the tests are honest.** They stub `fetch` and assert what the client actually sent, rather than mocking the API layer and asserting on the mock's own value. That distinction matters more than it sounds, and finding 1 below is the exception that proves where even good tests of this shape have a blind spot.

There is **one live bug**, one design bug, and a few small things.

**Verified by:** `npm test` (144 passed), `npm run lint`, `npm run build`, reading the views and the client, plus a probe against the real backend to confirm finding 1.

---

## 1. The faction rail always shows zero. `INDEX_LIMIT` exceeds what the API allows

`CatalogView.tsx` line 37:

```ts
const INDEX_LIMIT = 1000
```

used by the index query that feeds the faction counts:

```ts
const indexQuery = useUnits({ q: q || undefined, limit: INDEX_LIMIT })
```

The backend declares `limit: int = Query(default=50, ge=1, le=200)`. Anything above 200 is **rejected**, not clamped. Confirmed against the real API:

```
GET /units?limit=1000  ->  422
{"detail":[{"type":"less_than_equal","loc":["query","limit"],
            "msg":"Input should be less than or equal to 200","input":"1000"}]}
GET /units?limit=200   ->  200
```

So `indexQuery` never succeeds, and every consumer of it quietly falls back:

- `factionCounts` stays an empty `Map`, so `factionCounts.get(faction.id) ?? 0` renders **0 next to every faction**.
- `allCount = indexQuery.data?.total ?? 0` renders **"All units 0"**.

**The interesting part is why nothing caught it.** Not the type system: `limit` is just `number`, and 1000 is a fine number. Not the tests: they stub `fetch`, so the stub happily returns a 200 with units for a request the real server would reject. Not the UI: the `?? 0` and `?? []` fallbacks turn a failed request into a plausible-looking zero.

That is the blind spot in transport-stubbed tests. They verify *your* half of the conversation faithfully and assume the server agrees. Worth thinking about how you would catch this class of bug generally: a shared constant that both sides derive from, a contract test that runs against a real (or generated) API, a client generated from the OpenAPI schema that `/docs` already publishes, or at minimum surfacing query errors in the UI instead of defaulting them to zero.

The narrow fix is a smaller number. The useful question is what a "count all units" feature should do when the API caps a page at 200 in the first place, given the catalog holds about 1,331 units. The count you want is an aggregate the server should compute, not something the client derives by fetching everything.

## 2. "Owned only" filters after pagination, so it lies

Also `CatalogView.tsx`:

```ts
const total = unitsQuery.data?.total ?? 0
const pageUnits = unitsQuery.data?.units ?? []
const visibleUnits =
  ownedMode === 'owned' ? pageUnits.filter((u) => ownedIds.has(u.id)) : pageUnits
```

The server pages first (25 rows), then the client filters that page down to owned units. Consequences:

- The counter reads `{visibleUnits.length} of {total}`, so it can say **"2 of 1331"**, comparing a filtered page against an unfiltered grand total. Those two numbers are not the same kind of thing.
- Owned units sitting on page 3 are **invisible** while you are on page 1.
- If none of the first 25 happen to be owned, the view says **"No units match."** to someone who owns plenty. That is the bug a user would actually report.

The general rule: **filtering must happen on the same side as pagination.** Either the server takes an `owned` filter and pages the filtered set, or the client fetches the whole set and does both. Mixing them produces exactly this, and it is a mistake that survives review easily because each half looks correct in isolation.

The backend already supports the pieces (`GET /me/inventory` gives owned ids, `/units` takes filters), so this is mostly a decision about where the filter belongs. Given the catalog size, the server is the right answer.

## 3. `ArmyView` reports every failure as "Army not found"

```ts
if (armyQuery.isError || !armyQuery.data) {
  return <div className={styles.status}>Army not found</div>
}
```

A 404 and a dropped connection, a 500, or an expired token all render the same sentence. "Army not found" sends the user looking for a deleted army when the real story is that the API is down. `ApiError` already carries `status`, so the view can tell these apart. Worth doing wherever a view collapses an error state into one message.

## 4. A wrong password fires the "unauthorized" listeners

In `client.ts`:

```ts
if (res.status === 401) {
  tokenStore.clear()
  unauthorizedListeners.forEach((listener) => listener())
}
```

That fires on **any** 401, including a failed login attempt, because `POST /auth/login` answers a wrong password with 401. Today it happens to be harmless: the only listener sets `user` to null, and on the login page the user is already null.

But it is a trap set for later. The moment someone adds a listener that redirects, or shows a "your session expired, please sign in again" toast, mistyping a password will trigger it. The distinction the code is missing is between "a request was rejected because the session is stale" and "a credential check failed, which is this endpoint's normal way of saying no." Excluding the login route, or having `login()` opt out, is enough.

## 5. Smaller things

- **One in-flight mutation disables every row's button.** `disabled={removeUnit.isPending}` in `ArmyView` and `disabled={isAdding}` in `CatalogView` are shared across all rows, so removing one unit greys out Remove everywhere. Track the id being mutated if you want per-row disabling.
- **`register()` can leave an account created but signed out.** `AuthContext.register()` calls `apiRegister(...)` and then `login(...)`. If the register succeeds and the login call fails, the account exists but the user sees a failure and will probably try to register again, which now collides on a duplicate username or email.
- **`created_at` is asserted onto the type in tests.** `ArmyView.test.tsx` declares `Army_Read & { created_at: string }`, which suggests `created_at` is not on `Army_Read` in `types.ts` even though the backend sends it and `ArmyView` reads it. If the field is real, put it on the type rather than widening it at the test boundary. An intersection like that in a test is usually the type system telling you something true.

---

## What is genuinely good, and worth keeping deliberately

Naming these because they are choices, and choices erode unless someone says they were right:

- **One HTTP client.** Every resource function goes through `request()`, so the token is read in exactly one place, the error shape is parsed in exactly one place, and 204 is handled once. When the API contract changes, there is one file to edit.
- **Query keys are hierarchical and invalidation is precise.** `invalidateArmyMembership` invalidating the army, the list, the shortfall and the validation is exactly right: adding a unit really does change all four. Most codebases either invalidate everything or forget one.
- **The accessibility is real, not decorative.** `role="progressbar"` with `aria-valuenow`/`aria-valuetext`, skeletons wrapped as polite `status` regions with `aria-hidden` on the shimmer blocks, `aria-pressed` on the faction filters, labelled search. This is better than most production apps.
- **The tests assert behavior through the real query layer.** Stubbing `fetch` and rendering with a real `QueryClient` means the tests exercise the client, the hooks, and the component together. Keep doing that.

---

## Suggested fix order

1. **Finding 1** (`INDEX_LIMIT`). It is broken in production right now and it is a one-line change to stop the bleeding, then a conversation about where a total belongs.
2. **Finding 2** ("Owned only"). Same file, related decision, and it is the one users would actually complain about.
3. **Finding 4** (the 401 listener). Cheap, and it stops a future bug rather than a current one.
4. **Finding 3** (error messages) and the items in 5, whenever.

Findings 1 and 2 are both really the same lesson from opposite directions: **be deliberate about which side of the wire does the work.** Counting and filtering belong with the data, not with the page you happened to fetch.
