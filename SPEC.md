# Muster — Frontend Specification

The **Muster** web UI: a browser client for the Warhammer 40k army-list builder,
built with **Vite + React + TypeScript**. It is the presentation layer over the
`warhammer_unit` FastAPI backend — it holds no data of its own, it renders the
catalog, inventory, and armies the API serves and writes changes back through it.

The backend is documented in `../warhammer_unit/SPEC.md`; this file specifies the
frontend that consumes it. Where the two must agree (route shapes, field names,
status codes), the backend is the source of truth and this document mirrors it.

## What it is

A single-page app in two sections — a Warhammer 40,000 army-list builder under
`/army-list` and a Kill Team 2024 tracker under `/kill-team` — hung off a persistent
header. The core user
journey — the same "core loop" the backend defines — is:

```
register → log in → browse the catalog → record what you own (inventory)
        → build army lists → read points / shortfall / legality
```

Building army lists is **independent of what the user owns** — a list may include
units they haven't bought yet, so the two flows stay separate in the UI.

Everything below the auth screen is behind a **JWT**: a user sees only their own
inventory and armies; the catalog is shared and read-only to them.

The visual design is an imported Claude Design project (**"Muster — Collection
Index"**): an editorial / brutalist aesthetic — paper background, near-black ink,
hairline borders, large serif display headings, and monospaced uppercase labels.
See **Design language** below.

## Architecture overview

> **`ARCHITECTURE.md` is the normative source for this section.** The layering
> model below is the design intent and remains accurate. What it does not say is
> which of these rules are actually *enforced* by a lint rule, a type, or a CI
> step, and which are held up by convention alone. See
> [`ARCHITECTURE.md`](ARCHITECTURE.md) for that, and [`ROADMAP.md`](ROADMAP.md)
> for the gaps.

Four layers, each only talking to the one below it — the frontend mirror of the
backend's API → service → DB discipline:

```
      Views (route components)        src/views/
          │  render + dispatch intents
          ▼
      UI kit + state/context          src/ui/, src/auth/, src/toast/
          │  presentational components, session, notifications
          ▼
      Data layer (server state)       src/api/ + query hooks
          │  typed functions per resource, caching, mutations
          ▼
      HTTP client                     src/api/client.ts
          │  fetch wrapper: base URL, JWT header, error normalization
          ▼
      FastAPI backend (:8000)
```

Rules (the frontend analogues of the backend's layering rules):

- **Views never call `fetch` directly** — they call typed data-layer functions /
  hooks. A view knows *what* it needs, not *how* it is fetched.
- **The data layer never knows about React rendering** — it returns typed data
  and throws typed `ApiError`s; views/hooks decide how to display them.
- **One HTTP client** owns the base URL, the `Authorization` header, JSON
  encoding, and turning non-2xx responses into `ApiError`. Nothing else reads
  `localStorage` for the token or hard-codes a path prefix.
- **Types are generated/derived from the backend**, so a backend rename surfaces
  as a TypeScript error rather than a runtime `undefined` (see "Types").

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| Build / dev server | **Vite 8** (`@vitejs/plugin-react`) | Already scaffolded; fast HMR |
| Language | **TypeScript** (strict) | Type-safety against the API contract |
| UI library | **React 19** | Already scaffolded |
| Routing | **`react-router-dom` v7** | Standard client routing; nested routes + breadcrumbs |
| Server state | **TanStack Query (React Query) v5** | The app is almost entirely server state (catalog, armies, inventory) — caching, invalidation, and mutation status beat hand-rolled `useEffect` fetching |
| Local/UI state | React `useState` / context | Auth session, toast, modal open/close, view-local form state |
| Styling | **CSS variables + CSS Modules** (extracted theme) | Design tokens live once in `theme.css`; component styles are co-located and DRY (the chosen alternative to the design's verbatim inline styles) |
| API types | **`openapi-typescript`** from `/openapi.json` | Keeps `Unit_Read`/`Army_Read` in lockstep with `models.py` |

This stack is fully in place and building (see MVP.md "Feature checklist"). One
note on the table: `types.ts` is a thin **re-export layer** over generated code.
`scripts/gen-api.mjs` fetches the backend's published `openapi.json` and writes
`schema.d.ts` (static types) and `schemas.gen.ts` (zod response schemas); CI fails on
any diff against a fresh run. This said "hand-written, generation deferred" until F2
shipped it.

## Design language

Imported from the Claude Design project `Muster.dc.html`. The tokens below are the
single source of truth for `src/styles/theme.css`.

**Palette**

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FAFAF8` | App background |
| `--panel` | `#FFFFFF` | Inputs, raised cards |
| `--ink` | `#15140F` | Primary text, strong borders, primary buttons |
| `--ink-hover` | `#36332B` | Primary button hover |
| `--muted` | `#6F6C63` | Secondary text, meta lines |
| `--faint` | `#9C9A91` | Labels, tertiary text |
| `--fainter` | `#B6B4AC` | Numerals, separators |
| `--rule` | `#C9C7BF` | Medium borders (inputs, tags) |
| `--rule-light` | `#E4E2DB` | Light dividers (row separators) |
| `--danger` | `#B23A2E` | Auth / validation error text |

**Type** — three families, loaded from Google Fonts:

- **Newsreader** (serif) — display headings and unit names. Weights 400/500/600,
  plus italic for empty-state copy. This carries the "editorial" character.
- **Archivo** (sans) — body copy and dense UI text. 400–700.
- **Space Mono** (mono) — the signature: all uppercase micro-labels, meta lines,
  buttons, stat values, and numerals, with wide letter-spacing (`.1em`–`.32em`).

**Motifs** (encode these as reusable classes, not per-element inline styles):

- Hairline **1px `--ink` borders**; nested dividers step down to `--rule-light`.
- **Uppercase mono eyebrow labels** above serif headings (`FIELD INDEX` →
  *Collection*).
- **Sticky translucent header** (`rgba(250,250,248,.88)` + `backdrop-filter:
  blur`) with a bottom ink rule.
- **Segmented toggles** — bordered button pairs (List/Grid, Log In/Sign Up,
  Owned only/All units) where the active side inverts to ink-on-paper.
- **Toast**: fixed bottom-center, ink pill, mono text, slide-up animation.
- **Modal**: dim overlay (`rgba(20,20,15,.42)`) + centered paper card with fade/lift.
- Animations: `toastIn`, `overlayIn`, `cardIn` keyframes (carry over verbatim).
- Content column is **max-width ~1180px**, generous padding (`38px 48px 150px`).

## Project structure

```
warhammer_web/
  index.html
  vite.config.ts          # React plugin + dev proxy to :8000
  src/
    main.tsx              # root render + providers (Query, Router, Auth, Toast)
    App.tsx               # route table + auth gate + app shell (header/breadcrumbs)
    styles/
      theme.css           # design tokens (CSS variables) + font imports
      global.css          # reset, base element styles, keyframes, utilities
    api/
      client.ts           # fetch wrapper: base + /api/v1, JWT, JSON, ApiError
      parse.ts            # zod parse + ResponseShapeError
      paging.ts           # PageParams, toQueryString, fetchAllPages
      schema.d.ts         # GENERATED from the backend's openapi.json (do not edit)
      schemas.gen.ts      # GENERATED zod response schemas + PAGE_LIMIT_MAX
      types.ts            # thin re-exports of schema.d.ts + client-side helpers
      auth.ts             # register, login, getMe
      units.ts            # listUnits, getUnit, facets
      factions.ts         # listFactions (subfactions come nested, with ids)
      armies.ts           # CRUD + units + shortfall + validate
      inventory.ts        # list/add/setAmount/remove
      killTeam.ts         # the six public catalog reads
      killTeamRosters.ts  # the eight roster reads and writes
      queries.ts          # TanStack Query keys + hooks for the 40k half
      killTeamQueries.ts  # the same for Kill Team, catalog and rosters
    auth/
      AuthContext.tsx     # token in localStorage, current user, login/register/logout
      RequireAuth.tsx     # route guard → redirects to /login
    toast/
      ToastProvider.tsx   # renders the toast stack
      toastBus.ts         # enqueue transient messages from outside React
    test/
      setup.ts            # jest-dom matchers
      fixtures.ts         # typed builders + the ApiBody union that gates them
    ui/                 # design-system primitives, barrel-exported from index.ts
                        # Button, Input, Select, Field, Tabs, Modal, Tag, Toast,
                        # QuantityInput, SegmentedToggle, Header, Breadcrumbs
      Button.tsx  Input.tsx  Field.tsx  Tag.tsx  SegmentedToggle.tsx
      Modal.tsx   Toast.tsx  Header.tsx  Breadcrumbs.tsx  Eyebrow.tsx  EmptyState.tsx
      ErrorBoundary.tsx   # render-error fallback instead of a blank screen
    lib/
      roles.ts            # derive a display "role" + group units from keywords
      errors.ts           # ApiError -> user-facing message + per-field messages
      redirect.ts         # post-login destination, internal paths only
      format.ts           # points, counts, date labels
    views/
      AuthView.tsx        # /login  (login + signup tabs)
      CollectionView.tsx  # /army-list  (armies list/grid)
      ArmyView.tsx        # /army-list/armies/:armyId
      CatalogView.tsx     # /army-list/catalog and /army-list/armies/:armyId/catalog
      InventoryView.tsx   # /army-list/inventory
      UnitView.tsx        # /army-list/units/:unitId
      SectionView.tsx     # / (the section chooser)
      KillTeamCatalogView.tsx  # /kill-team
      KillTeamView.tsx    # /kill-team/teams/:killTeamId
      KillTeamRostersView.tsx  # /kill-team/rosters
      KillTeamRosterView.tsx   # /kill-team/rosters/:rosterId
      NewRosterModal.tsx       # the create-roster overlay
      killTeamCards.tsx        # datacard pieces shared by the team and roster screens
      NewArmyModal.tsx         # the create-army overlay
```

## Development

The frontend and backend run as **two processes** in dev; the browser sees one
origin because Vite proxies API paths to the backend (**Option B** from the
backend SPEC's "Frontend integration" — relative URLs + proxy, so CORS is a
fallback, not the primary mechanism).

| Command | What it does |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | Vite dev server with HMR (default `:5173`), proxying to the API |
| `npm run build` | `tsc -b` typecheck + `vite build` → `dist/` |
| `npm run preview` | serve the production build locally |
| `npm run lint` | eslint |
| `npm run gen:api` | regenerate `src/api/schema.d.ts` from the backend's published `openapi.json` |

**Prerequisite:** the backend must be running and its catalog **seeded**, or the
app renders correct-but-empty views. Bring it up from `../warhammer_unit`:
`make run` (or `make docker-up`), then `make scrape` → `make seed`. An empty
`GET /units` means "catalog not seeded," not a frontend bug.

**Environment.** No secrets live in the frontend. The API base URL is a relative
`""` in dev (the proxy handles it); for a cross-origin deploy it comes from a
build-time `VITE_API_BASE_URL`. Nothing else is configurable at runtime.

### Vite dev proxy

`vite.config.ts` forwards the backend's route prefixes to `http://localhost:8000`
so `fetch("/units")` from the browser reaches the API on one origin:

```ts
// vite.config.ts — one entry, because every backend route is under /api/v1
server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }
```

(The backend mounts every route under `/api/v1`, so the proxy is a single `/api`
entry. It used to list each prefix; `src/api/devProxy.test.ts` now reads the patterns
out of `vite.config.ts` and asserts they agree with the client's prefix.)

## HTTP client (`src/api/client.ts`)

One `request()` helper backs every resource function:

- **Base URL** — `import.meta.env.VITE_API_BASE_URL ?? ""` (empty = same origin
  via the proxy in dev).
- **Auth** — reads the JWT from `localStorage` and sets
  `Authorization: Bearer <token>` when present. This is the *only* place the token
  is attached.
- **Bodies** — JSON by default (`Content-Type: application/json`). The **one
  exception is `POST /auth/login`**, which the backend serves as an OAuth2
  *password form*: send `application/x-www-form-urlencoded` with `username` and
  `password` fields (`username` may be a username **or** an email).
- **Responses** — `204 No Content` returns `undefined`; otherwise parse JSON.
  Every collection returns a `Page<T>` body (`{items, total, limit, offset}`), so
  the total travels **in the body**. It used to be an `X-Total-Count` header, which
  a browser cannot read cross-origin unless the server names it in
  `expose_headers` — that silence is what capped the deployed catalog at 25 units.
- **Errors** — any non-2xx becomes a thrown `ApiError { status, message, code?, field?, errors[], requestId? }` — `code` is the enum `src/lib/errors.ts` maps to copy,
  built from the backend's `{ "detail": message, "field"? }` body. A **401**
  additionally clears the stored token and signals the auth layer to bounce to
  `/login`. This mirrors the backend's error contract:

| Backend status | Meaning | Frontend handling |
|---|---|---|
| 401 | missing/invalid JWT | clear token, redirect to `/login` |
| 403 | not an admin (catalog writes) | not reachable by normal users; show a generic error if hit |
| 404 | not found / not yours | "not found" view or toast |
| 409 | `ConflictError` (duplicate) | inline form error using `field` |
| 400 | `*ValidationError` | inline form error using `field` |
| 422 | request-shape (Pydantic) | inline form error (map by field) |

## Types (`src/api/types.ts`)

Types mirror the backend response/request schemas. The intended path is to
**generate** them from the live OpenAPI schema (`openapi-typescript`
`http://localhost:8000/openapi.json`), so the two never drift. Key shapes the UI
relies on (from the backend routers):

- `Unit_Read` — `{ id, unit_name, faction_id, subfaction_id, movement, toughness,
  armor_save, wounds, invulnerable_save, leadership, objective_control, points,
  keywords: string[], weapons: Weapon_Read[], abilities: Ability_Read[] }`
- `Weapon_Read` — `{ id, name, category: "range"|"melee", keywords, range_inches,
  attacks, weapon_skill, strength, armor_piercing, damage }`
- `Ability_Read` — `{ id, name, description }`
- `Faction_Read` — `{ id, name, subfactions: { id, name }[] }`
- `Army_Read` — `{ id, name, faction_id, subfaction_id, description, points_limit,
  points_total, units: { unit: Unit_Read, amount }[] }`
- `UserUnit_Read` / `ArmyUnit_Read` — `{ unit: Unit_Read, amount }`
- `Shortfall_Read[]` — `{ unit, in_list, owned, need }[]`
- `Validation_Read` — `{ ok, points_total, points_limit, issues: { kind, detail,
  unit? }[] }`
- `User_Read` — `{ id, username, email }`; `Token` — `{ access_token, token_type }`

## Auth & session (`src/auth/`)

- **Register** — `POST /auth/register` with JSON `{ username, email, password }` →
  `201 User_Read`. The signup form's "Name" field maps to **`username`**; the
  server hashes the password (a client hash is never sent).
- **Log in** — `POST /auth/login` as an OAuth2 form (see client) → `Token`; store
  `access_token` in `localStorage`. The design's login collects **email** +
  password, which we send as the `username` identifier (the backend accepts
  username or email).
- **Current user** — `GET /me` with the Bearer token hydrates `AuthContext` on
  load; a 401 means the token is stale → clear it and show `/login`.
- **Log out** — drop the token from `localStorage`, reset Query cache, redirect.
- **Guarding** — `RequireAuth` wraps every route except `/login` **and the public Kill
  Team catalog** (`/kill-team`, `/kill-team/teams/:killTeamId`), whose reads need no
  token; unauthenticated access to a guarded route redirects to `/login`. There is no refresh-token flow (out of scope — a single
  access token expiring per `ACCESS_TOKEN_EXPIRE_MINUTES`; expiry → re-login).

## Routing & views

Decision numbers below (`#11`, `#21`, …) refer to
[`KILLTEAM.md` in the API repo](https://github.com/incaholy/Warhammer-unit/blob/main/KILLTEAM.md),
which is where the Kill Team design lives.

`react-router` with TWO branches: a public one and an authenticated one. Almost
everything is guarded, but the Kill Team **catalog** is reference data whose reads
need no token (KILLTEAM.md #21), so a visitor can follow a shared team link without
an account. Breadcrumbs are derived from the route match, reproducing the design's
crumb bar, and are rooted at the SECTION — `/` is a chooser and carries none.

| Route | View | Backend calls |
|---|---|---|
| `/login` | `AuthView` | `POST /auth/register`, `POST /auth/login` |
| `/` | `SectionView` | — (a chooser between the two sections; KILLTEAM.md #11) |
| `/army-list` | `CollectionView` | `GET /me/armies` |
| `/army-list/armies/:armyId` | `ArmyView` | `GET /me/armies/{id}` (+ `remove_unit`, later `validate`/`shortfall`) |
| `/army-list/armies/:armyId/catalog` | `CatalogView` (army target) | `GET /factions`, `GET /units`, `POST /me/armies/{id}/units` |
| `/army-list/catalog` | `CatalogView` (inventory target) | `GET /factions`, `GET /units`, `POST /me/inventory` |
| `/army-list/inventory` | `InventoryView` | `GET /me/inventory`, `PATCH`/`DELETE /me/inventory/{unit_id}` |
| `/army-list/units/:unitId` | `UnitView` | `GET /units/{id}` (+ add-to-army / set-owned by context) |
| `/kill-team` | `KillTeamCatalogView` | `GET /kill-team/teams`, `GET /kill-team/factions` — **public** |
| `/kill-team/teams/:killTeamId` | `KillTeamView` | `GET /kill-team/teams/{id}`, `GET /kill-team/universal` — **public** |
| `/kill-team/rosters` | `KillTeamRostersView` | `GET`/`POST /me/kill-team/rosters` |
| `/kill-team/rosters/:rosterId` | `KillTeamRosterView` | `GET`/`PATCH`/`DELETE /me/kill-team/rosters/{id}`, the three `/operatives` routes, `GET /kill-team/operatives` |
| `/kill-team/games` | `KillTeamGamesView` | `GET`/`POST /me/kill-team/games` |
| `/kill-team/games/:gameId` | `KillTeamGameView` | `GET`/`PATCH`/`DELETE /me/kill-team/games/{id}`, and the nested operative, equipment, ploy, advance and undo operations |

Plus the **pre-section redirects**, kept so bookmarks from before the two sections
survive: `/inventory`, `/catalog`, `/armies/*` and `/units/*` each resolve to their
`/army-list` equivalent, built from the current pathname so a route parameter and the
query string both carry across. `*` falls through to `/` — there is no "not found" screen, which
ROADMAP F13 records as a defect rather than a design.

**Header** — sticky; the wordmark returns to the section chooser at `/`. **Two
rows**: the top switches SECTION (Army List / Kill Team), the second shows that
section's own pages. Log Out when signed in, **Sign in** when not, because the Kill
Team catalog is public and the bar renders for visitors. Present on every route
but `/login`.

### AuthView (`/login`)
Login/Sign-Up segmented tabs. Login = email + password; Sign Up = name + email +
password + confirm. Inline error region bound to `ApiError.message`/`field`
(bad credentials → 401, duplicate email/username → 409). On success, store token
and navigate Home.

### CollectionView (`/army-list`)
The armies index. Header eyebrow + serif *Collection* title + a meta line
(`N armies · M units · P pts`, aggregated client-side from `GET /me/armies`).
**List/Grid** segmented toggle (layout is UI state, persisted to `localStorage`).
**+ New Army** opens the modal. Each army row/card shows faction, name,
description ("note"), `points_total`, unit count. Empty state when the user has no
armies.

### ArmyView (`/army-list/armies/:armyId`)
Army header (faction eyebrow, serif name, optional faction blurb, then
`points · units · created`). **Order of Battle**: units grouped by a derived
**role** (see "Deriving role"), each row linking to the datasheet, showing `×qty`,
with a **Remove** action (`DELETE …/units/{unit_id}`). **+ Add From Catalog** →
`/army-list/armies/:armyId/catalog`. Empty state ("No units mustered yet") when the army has
no units. *(Points-limit progress and a legality panel are backend-ready via
`points_limit`/`validate` — see Roadmap; the base view shows `points_total`.)*

### CatalogView (`/army-list/catalog`, `/army-list/armies/:armyId/catalog`)
Shared catalog browser with a **target** (an army or the inventory), which decides
what the row's **+ Add** does (`POST …/units` vs `POST /me/inventory`) and the
header's "Adding to —" label. Left rail = **faction filter** from `GET /factions`
(each with a live count); main column = search box (`q`), an **Owned only / All
units** toggle (cross-referencing inventory), and unit rows (name, faction · role,
an owned tag, **+ Add**). Uses the page body's `total` for the "N of M" label.
Paged via `limit`/`offset`.

### InventoryView (`/army-list/inventory`)
The user's owned datasheets (`GET /me/inventory`), grouped into **collapsible**
role sections (chevron toggles, expanded state is UI-local). Each row: unit name,
role, an **editable owned quantity** (`number` input → `PATCH /me/inventory/{unit_id}`,
debounced), and **Remove** (`DELETE …`). Header meta: `owned datasheets · total
models`. Search filters client-side / via `q`. **+ Add to Inventory** →
`/army-list/catalog`. Empty state when nothing is owned.

### UnitView (`/army-list/units/:unitId`)
The full datasheet from `GET /units/{id}`: eyebrow (`faction — role`), serif name,
a **6-column profile grid** (M / T / Sv / W / Ld / OC), **Ranged** and **Melee**
weapon tables (columns Range/A/BS-or-WS/S/AP/D, split by `weapon.category`),
**Abilities** (name + description), and **Keywords** (mono tag chips). Context
actions on the right: **+ Add to {army}** when arrived from an army, or an
**editable "In collection" quantity** when arrived from inventory; otherwise a
read-only owned label.

### SectionView (`/`)
The chooser between the app's two sections, so neither is the implicit default
(KILLTEAM.md #11). Two cards: **Army List** and **Kill Team**, the latter noting
that its catalog needs no account. No backend calls. Carries no breadcrumbs.

### KillTeamCatalogView (`/kill-team`)
**Public.** The kill teams from `GET /kill-team/teams`, paged at 25 with Prev/Next,
each row linking to its own page. A **faction `Select`** narrows the list
*server-side* (`?faction_id=`) and returns to the first page, because holding an
offset across a filter change lands on an empty page of a smaller set. A team row
carries `faction_id` and never a copy of the name (#46), so the name is resolved
from `GET /kill-team/factions`, fetched whole; losing that read costs the labels,
not the list. **Filtered rather than grouped**: #12 permits grouping, but the list
is paged and a group heading would split across a page boundary.

### KillTeamView (`/kill-team/teams/:killTeamId`)
**Public.** One team in three tabs, from **one** request — `KillTeam_Detail` nests
the datacards, rules, ploys, equipment *and* the composition (#47), so the separate
`/composition` endpoint stays unused here.

**Datacards** — a card per operative: stat line (APL / Move / Save / Wounds), a
weapon table (A / Hit / Dmg / Rules, with `melee` or the range), abilities, and
keywords. Weapon rules print verbatim, footnote markers included (#56). An
`in_battle` card is **marked, not hidden** (#20, #51).

**Composition** — the printed words. One row per `{position, depth, kind}`, read in
`position` order and indented by `depth`, with footnote bodies as their own `note`
rows (#30). **Nothing is derived** — no budget, no model count, no caps, no entry
resolved to a datacard (#28, #44).

**Rules & Ploys** — the team's rules (with a `group` where printed), its ploys with
kind and CP cost, and its equipment; then the universal ploys and equipment from
`GET /kill-team/universal`, kept for the session (#48), in a separate block so "its
own, plus these" reads as such.

Real `tablist`/`tabpanel` semantics rather than `SegmentedToggle`, which is a toggle
group and belongs on a display mode like List/Grid. Nothing in this view sorts
(#25).

### KillTeamRostersView (`/kill-team/rosters`)
The player's own rosters, **fetched whole** — a handful, and the count states a fact
about all of them. No faction lookup: a roster LIST row carries `kill_team_name` and
`faction_name` outright, where the catalog's team row carries only `faction_id`. Each
row links to its own page and shows its description when it has one. Two entry points
to **+ New Roster**, header and empty state, because an empty list is when the header
button is easiest to miss.

### New Roster modal
Roster Name, a **`Select` of every kill team** labelled `"Raveners — Tyranids"`, and an
optional Description. Uses `useAllKillTeams`, the one catalog read that goes whole
rather than paged: a dropdown offering the first 25 of 48 teams is missing half of
them, and a `<select>` cannot be paged. Both picker queries are gated on `open`,
because `Modal` stays mounted while closed to restore focus. An empty description is
**omitted** rather than sent as `''`. States that the kill team is fixed once created,
while it is still a choice. A duplicate name (#64) shows in the form, worded by the
backend.

### KillTeamRosterView (`/kill-team/rosters/:rosterId`)
One roster in two tabs, **Operatives** and **Reference**, from one request —
`KTRoster_Read` carries the rows with their datacards, the team's rules, ploys and
equipment, and both universal lists (#52). The picker is the one extra read, because
the pool to add *from* is the catalog's.

Each row is numbered by its **place in the list, never by `row.position`**: position is
a sort hint that is neither contiguous nor distinct (#53), so after a move it can read
`0, 7, 7`. Two rows holding the same datacard render as two rows (#50), so every row
action is named by position as well as by datacard — "Move Hormagaunt up" is ambiguous
twice over on a real roster. The datacard sits behind a collapsed `<details>`.

**Writes:** inline rename (guarded against an unchanged or blank name, though
`KTRoster_Update.name` is server-constrained unlike `Army_Update.name`), **↑/↓** which
*swap* two positions in two PATCHes because a single nudge would leave a tie for `id`
to break, **Remove** by the row's own id, an inline **picker** of the team's datacards,
and **Delete Roster** behind a confirm dialog. Reorder disables across every row while
a move is in flight, since a move is two writes. An `in_battle` datacard is **addable**
— the backend refuses only a cross-team or withdrawn card, so availability informs and
never refuses (#51). A refused delete (#60) closes the dialog so the toast is readable.

### New Army modal
Overlay + paper card. Fields: **Army Name** and a **Faction** select populated
from `GET /factions`. **Create** → `POST /me/armies` then navigate to the new
army. Subfaction, description and points-limit are all sent (roadmap step 11).

### Toast
Global transient confirmations ("Added to inventory", "Army created", "Removed").
Enqueued from mutation `onSuccess`; auto-dismisses.

## State management

- **Server state → TanStack Query.** Keys are `[resource, kind, ...]`, which is what
  lets a prefix invalidate in both directions — `['armies']` matches the list and
  every detail. `src/api/queries.ts` owns the 40k factory (`['armies','list']`,
  `['armies','detail',id]`, `['units','list',filters]`, `['units','facets',filters]`,
  `['factions','list']`, `['inventory','list']`); `src/api/killTeamQueries.ts` owns a
  second factory for Kill Team. There is no `me` key — F9 deleted it. This described
  the old flat shape (`["army", id]`, `["units", filters]`) until F5 reshaped them.
  Mutations (create army, add/remove
  unit, set amount, add-to-inventory) invalidate the affected keys so views
  refresh without manual refetching. Upserts (add-to-army / add-to-inventory) key
  off the backend's 201-vs-200 to word the toast ("added" vs "increased").
- **Session state → `AuthContext`** (token + current user).
- **UI state → local/context** — modal open, toast queue, catalog layout, expanded
  inventory groups, form fields. None of it is persisted except the catalog layout
  preference and the token.

## Design ↔ backend reconciliation

The imported design was drawn with **placeholder data**; these are the points
where it and the real API must be reconciled, and how:

- **Factions are real, not the mock four.** The design's *Ferrum Wardens /
  Sepulchral Host / Verdant Swarm / Solar Levy* are placeholders (GW-IP-safe). The
  app uses the backend's real factions from `GET /factions`
  (Imperium / Xenos / Chaos / Space Marines) and their subfactions.
- **Deriving "role".** The design groups units by a *role* (Character, Battleline,
  Vehicle, …) and shows it as an eyebrow, but the backend `Unit` has **no role
  field** — only `keywords: string[]`. `src/lib/roles.ts` derives a display role
  by scanning keywords against an ordered priority list
  (`Epic Hero`/`Character` → "Characters", `Battleline` → "Battleline",
  `Vehicle`/`Walker` → "Vehicles", `Monster` → "Monsters", `Mounted`/`Beast`/
  `Swarm` → their names, else "Other Units"), and groups by that. This keeps the
  grouped "Order of Battle" / inventory layout without a backend change.
- **Faction blurbs are flavor, not data.** The design's per-faction descriptive
  copy has no backend field. Dropped rather than carried as a static table; the
  army's own "note" uses the backend's `description`.
- **Login by email.** Covered above — the email goes into the OAuth2 `username`
  field.
- **Backend capabilities the base design doesn't yet surface** — `points_limit`,
  `validate` (legality issues), and `shortfall` ("what to buy"). These are
  first-class in the API and belong in the UI; they're tracked as near-term
  additions (Roadmap) rather than invented into the initial port.

## Error & empty states

- **Empty** (no armies / no inventory / no catalog results / empty army) — each
  view has a dedicated dashed-border or italic-serif empty state from the design.
- **Loading** — Query `isPending` renders skeleton rows / a quiet placeholder, not
  a spinner blocking the whole page.
- **Errors** — form submissions show inline errors from `ApiError.field`/`message`;
  background fetch failures surface a toast with a retry. A 401 anywhere bounces to
  `/login`.

## Testing

- **Component/unit tests** — **Vitest + React Testing Library**: the `roles.ts`
  derivation, the `client.ts` error/`204`/form-encoding behavior, and key view
  interactions (add-to-army updates the list, amount edit persists) against a
  **stubbed `fetch`**, so tests need no live backend. MSW was considered and not
  adopted — see the note at the end of this section.
- **Type-level** — `tsc -b` in `npm run build` is a test: generated API types make
  a backend contract change fail the build.
- **Manual/e2e** — against a seeded local backend, walk the core loop. A Playwright
  smoke test is a later addition, not MVP.

## Build & deployment

- `npm run build` → static `dist/` (typecheck then Vite build).
- **Prod topology**: **Firebase Hosting** serves `dist/` and the app calls the API
  **cross-origin** at `VITE_API_BASE_URL` (`firebase.json` is committed). Two
  origins, so CORS matters: the backend enables `CORSMiddleware` via its
  `ALLOWED_ORIGINS` allow-list, and ARCHITECTURE §2.3's argument for keeping `total`
  in the body rather than a response header rests on exactly this. A same-origin
  reverse proxy (Caddy/nginx) was the earlier plan, taken from the backend SPEC's
  "Frontend integration"; it is not what ships.
- The frontend is **stateless and secret-free**: the only runtime input is the API
  base URL; the JWT lives in the browser.

## Roadmap

> This is the **build** roadmap: the MVP port, feature by feature. Architecture
> hardening (enforcement, the network contract, cross-repo concerns) is tracked
> separately in [`ROADMAP.md`](ROADMAP.md), which reconciles against the
> "Deferred" items below rather than duplicating them.

Ordered easiest-first, mirroring the backend SPEC's style. Steps 1–8 are the MVP
port; 9+ surface backend capabilities the base design omitted. **Steps 1–12 are
complete** (lint + build clean, contract verified against the live
backend); the remaining polish items are called out per step.

1. ✅ **Scaffold** — `react-router-dom`, TanStack Query; `theme.css` /
   `global.css`; Vite demo removed.
2. ✅ **HTTP client + types** — `client.ts` (base + `/api/v1`, JWT, `ApiError`,
   form-login) and `types.ts`, now thin re-exports of the generated
   `schema.d.ts`.
3. ✅ **Auth** — `AuthContext`, `RequireAuth`, `AuthView` (login/signup), Vite proxy.
4. ✅ **UI kit** — Button, Input/Field, Tag, SegmentedToggle, Modal (focus-trap),
   Toast, Header, Breadcrumbs, Eyebrow, EmptyState from the design tokens.
5. ✅ **Collection + New Army modal** — armies list/grid, create army.
6. ✅ **Catalog + Unit datasheet** — faction filter, search, add-to-target; the
   profile/weapons/abilities/keywords datasheet.
7. ✅ **Inventory** — grouped owned units, editable amounts, add-to-inventory.
8. ✅ **Army detail** — order of battle, add/remove units, points total.
9. ✅ **Points limit + validation panel** — `points_limit` progress + `/validate`
   issues (over-points, wrong-faction/subfaction) on the army view.
10. ✅ **Shortfall** — a "what to buy" panel diffing an army against inventory.
11. ✅ **Richer New Army** — subfaction (dependent select), description,
    points-limit fields.
12. ◑ **Polish** — done: skeleton loaders, responsive breakpoints, modal
    focus-trap/keyboard a11y, tests (Vitest + RTL), and `npm run gen:api` (F2 —
    CI gates its freshness). **Deferred:** optimistic mutations (currently
    invalidate-and-refetch). MSW not adopted — tests mock `fetch`/hooks directly.

### Post-roadmap additions (beyond the original plan)

- ✅ **Routing + breadcrumbs shell** — the central route table (`App.tsx`) mounting
  every view behind `RequireAuth` in a `Header` shell, with route-structural
  breadcrumbs.
- ✅ **Toasts wired to mutations** — `src/toast/` bus + provider; the QueryClient's
  `MutationCache` surfaces failures (the `ApiError` message) and successes
  (`meta.successMessage`) centrally.
- ✅ **Error boundary** — a render-error fallback instead of a blank screen.
- ✅ **Route-level code splitting** — `React.lazy` + `Suspense` per view.
- ✅ **CI** — GitHub Actions (`.github/workflows/ci.yml`): `npm ci`, a
  generated-types freshness gate, lint, `npm run build`, a base-branch build,
  the bundle budget, and `npm run test:coverage`. Pushes to `main`, and **every**
  pull request whatever its target branch.
- ✅ **A browser suite** — `npm run test:browser`, WebKit at the iPhone 14
  viewport, asserting layout rather than behaviour (ROADMAP KF9). Deliberately
  outside CI.
- **Deferred:** deploy config (`VITE_API_BASE_URL`, backend `SECRET_KEY` /
  `ALLOWED_ORIGINS`) and a Playwright smoke walk of the CORE LOOP, which the
  layout suite above does not attempt.

## Out of scope (not MVP)

- Admin/catalog authoring (units/weapons/abilities CRUD) — the catalog is
  admin-curated on the backend; the app is read-only against it.
- Datasheet versioning, wargear/loadout modelling, and list sharing/export —
  all out of scope on the backend too.
- **Game tracking is no longer out of scope.** It was, on both sides, when this
  was written. The backend has since shipped a Kill Team tracker (its `K1`–`K7`),
  and the frontend half is [`ROADMAP.md`](ROADMAP.md)'s `KF1`–`KF9`. 40k match
  tracking remains out of scope; Kill Team is its own section, not an addition to
  the army-list builder (KILLTEAM.md #11).
- Offline support / PWA, i18n, and a design-system theming layer beyond the single
  imported look.
