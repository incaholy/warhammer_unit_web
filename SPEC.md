# Muster — Frontend Specification

The **Muster** web UI: a browser client for the Warhammer 40k army-list builder,
built with **Vite + React + TypeScript**. It is the presentation layer over the
`warhammer_unit` FastAPI backend — it holds no data of its own, it renders the
catalog, inventory, and armies the API serves and writes changes back through it.

The backend is documented in `../warhammer_unit/SPEC.md`; this file specifies the
frontend that consumes it. Where the two must agree (route shapes, field names,
status codes), the backend is the source of truth and this document mirrors it.

## What it is

A single-page app with six views hung off a persistent header. The core user
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

These are the intended stack; only Vite/React/TS are installed today (see MVP.md
"Feature checklist" for build status).

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
      client.ts           # fetch wrapper: base, JWT, JSON, ApiError, X-Total-Count
      types.ts            # hand or openapi-typescript generated schema types
      auth.ts             # register, login, getMe
      units.ts            # listUnits, getUnit  (+ list weapons/abilities if needed)
      factions.ts         # listFactions, factionTaxonomy
      armies.ts           # CRUD + units + shortfall + validate
      inventory.ts        # list/add/setAmount/remove
      queries.ts          # TanStack Query keys + hooks wrapping the above
    auth/
      AuthContext.tsx     # token in localStorage, current user, login/register/logout
      RequireAuth.tsx     # route guard → redirects to /login
    toast/
      ToastContext.tsx    # enqueue transient messages
    ui/                   # design-system primitives (see "UI kit")
      Button.tsx  Input.tsx  Field.tsx  Tag.tsx  SegmentedToggle.tsx
      Modal.tsx   Toast.tsx  Header.tsx  Breadcrumbs.tsx  Eyebrow.tsx  EmptyState.tsx
    lib/
      roles.ts            # derive a display "role" + group units from keywords
      factionFlavor.ts    # optional static blurb per faction name (design flavor)
      format.ts           # points, counts, date labels
    views/
      AuthView.tsx        # /login  (login + signup tabs)
      CollectionView.tsx  # /        (armies list/grid)
      ArmyView.tsx        # /armies/:armyId
      CatalogView.tsx     # /catalog and /armies/:armyId/catalog
      InventoryView.tsx   # /inventory
      UnitView.tsx        # /units/:unitId
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
| `npm run gen:api` *(planned)* | regenerate `src/api/types.ts` from `/openapi.json` |

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
server: {
  proxy: Object.fromEntries(
    ["/auth", "/me", "/units", "/factions", "/weapons", "/abilities", "/health"]
      .map((p) => [p, { target: "http://localhost:8000", changeOrigin: true }])
  ),
}
```

(The backend mounts routes at the root, not under `/api`, so the proxy lists the
prefixes explicitly rather than a single `/api`.)

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
  Reads that need the paged total (`GET /units`) expose the **`X-Total-Count`**
  response header alongside the body.
- **Errors** — any non-2xx becomes a thrown `ApiError { status, message, field? }`,
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
- **Guarding** — `RequireAuth` wraps every non-auth route; unauthenticated access
  redirects to `/login`. There is no refresh-token flow (out of scope — a single
  access token expiring per `ACCESS_TOKEN_EXPIRE_MINUTES`; expiry → re-login).

## Routing & views

`react-router` with a top-level auth gate. Breadcrumbs are derived from the route
match, reproducing the design's crumb bar.

| Route | View | Backend calls |
|---|---|---|
| `/login` | `AuthView` | `POST /auth/register`, `POST /auth/login` |
| `/` | `CollectionView` | `GET /me/armies` |
| `/armies/:armyId` | `ArmyView` | `GET /me/armies/{id}` (+ `remove_unit`, later `validate`/`shortfall`) |
| `/armies/:armyId/catalog` | `CatalogView` (army target) | `GET /factions`, `GET /units`, `POST /me/armies/{id}/units` |
| `/catalog` | `CatalogView` (inventory target) | `GET /factions`, `GET /units`, `POST /me/inventory` |
| `/inventory` | `InventoryView` | `GET /me/inventory`, `PATCH`/`DELETE /me/inventory/{unit_id}` |
| `/units/:unitId` | `UnitView` | `GET /units/{id}` (+ add-to-army / set-owned by context) |

**Header** — sticky; logo/wordmark returns Home, a segmented `Armies | Inventory`
nav, and Log Out. Present on every authenticated route.

### AuthView (`/login`)
Login/Sign-Up segmented tabs. Login = email + password; Sign Up = name + email +
password + confirm. Inline error region bound to `ApiError.message`/`field`
(bad credentials → 401, duplicate email/username → 409). On success, store token
and navigate Home.

### CollectionView (`/`)
The armies index. Header eyebrow + serif *Collection* title + a meta line
(`N armies · M units · P pts`, aggregated client-side from `GET /me/armies`).
**List/Grid** segmented toggle (layout is UI state, persisted to `localStorage`).
**+ New Army** opens the modal. Each army row/card shows faction, name,
description ("note"), `points_total`, unit count. Empty state when the user has no
armies.

### ArmyView (`/armies/:armyId`)
Army header (faction eyebrow, serif name, optional faction blurb, then
`points · units · created`). **Order of Battle**: units grouped by a derived
**role** (see "Deriving role"), each row linking to the datasheet, showing `×qty`,
with a **Remove** action (`DELETE …/units/{unit_id}`). **+ Add From Catalog** →
`/armies/:armyId/catalog`. Empty state ("No units mustered yet") when the army has
no units. *(Points-limit progress and a legality panel are backend-ready via
`points_limit`/`validate` — see Roadmap; the base view shows `points_total`.)*

### CatalogView (`/catalog`, `/armies/:armyId/catalog`)
Shared catalog browser with a **target** (an army or the inventory), which decides
what the row's **+ Add** does (`POST …/units` vs `POST /me/inventory`) and the
header's "Adding to —" label. Left rail = **faction filter** from `GET /factions`
(each with a live count); main column = search box (`q`), an **Owned only / All
units** toggle (cross-referencing inventory), and unit rows (name, faction · role,
an owned tag, **+ Add**). Uses `X-Total-Count` for the "N of M" result label.
Paged via `limit`/`offset`.

### InventoryView (`/inventory`)
The user's owned datasheets (`GET /me/inventory`), grouped into **collapsible**
role sections (chevron toggles, expanded state is UI-local). Each row: unit name,
role, an **editable owned quantity** (`number` input → `PATCH /me/inventory/{unit_id}`,
debounced), and **Remove** (`DELETE …`). Header meta: `owned datasheets · total
models`. Search filters client-side / via `q`. **+ Add to Inventory** →
`/catalog`. Empty state when nothing is owned.

### UnitView (`/units/:unitId`)
The full datasheet from `GET /units/{id}`: eyebrow (`faction — role`), serif name,
a **6-column profile grid** (M / T / Sv / W / Ld / OC), **Ranged** and **Melee**
weapon tables (columns Range/A/BS-or-WS/S/AP/D, split by `weapon.category`),
**Abilities** (name + description), and **Keywords** (mono tag chips). Context
actions on the right: **+ Add to {army}** when arrived from an army, or an
**editable "In collection" quantity** when arrived from inventory; otherwise a
read-only owned label.

### New Army modal
Overlay + paper card. Fields: **Army Name** and a **Faction** select populated
from `GET /factions`. **Create** → `POST /me/armies` then navigate to the new
army. (Subfaction, description, and points-limit are backend-supported and can be
added to the modal later — see Roadmap.)

### Toast
Global transient confirmations ("Added to inventory", "Army created", "Removed").
Enqueued from mutation `onSuccess`; auto-dismisses.

## State management

- **Server state → TanStack Query.** One query key per resource
  (`["armies"]`, `["army", id]`, `["units", filters]`, `["unit", id]`,
  `["factions"]`, `["inventory"]`, `["me"]`). Mutations (create army, add/remove
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
  copy has no backend field. Either drop it or keep a small static
  `factionFlavor.ts` keyed by faction name; the army's own "note" uses the
  backend's `description`.
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
  **mocked API** (MSW — Mock Service Worker), so tests need no live backend.
- **Type-level** — `tsc -b` in `npm run build` is a test: generated API types make
  a backend contract change fail the build.
- **Manual/e2e** — against a seeded local backend, walk the core loop. A Playwright
  smoke test is a later addition, not MVP.

## Build & deployment

- `npm run build` → static `dist/` (typecheck then Vite build).
- **Prod topology** (from the backend SPEC's "Frontend integration"): a reverse
  proxy (Caddy/nginx) serves `dist/` and forwards API paths to the `api` service —
  **one origin, no CORS**. If the frontend is ever hosted cross-origin, the backend
  enables `CORSMiddleware` via its `ALLOWED_ORIGINS` allow-list and the frontend
  sets `VITE_API_BASE_URL` to the API origin.
- The frontend is **stateless and secret-free**: the only runtime input is the API
  base URL; the JWT lives in the browser.

## Roadmap

Ordered easiest-first, mirroring the backend SPEC's style. Steps 1–8 are the MVP
port; 9+ surface backend capabilities the base design omitted.

1. **Scaffold** — install `react-router-dom`, TanStack Query; add `theme.css` /
   `global.css`; remove the Vite demo (`App.css`, demo `App.tsx`, assets).
2. **HTTP client + types** — `client.ts` (base, JWT, `ApiError`, form-login,
   `X-Total-Count`) and `types.ts` (generated from OpenAPI).
3. **Auth** — `AuthContext`, `RequireAuth`, `AuthView` (login/signup), Vite proxy.
4. **UI kit** — Button, Input/Field, Tag, SegmentedToggle, Modal, Toast, Header,
   Breadcrumbs, Eyebrow, EmptyState from the design tokens.
5. **Collection + New Army modal** — armies list/grid, create army.
6. **Catalog + Unit datasheet** — faction filter, search, add-to-target; the
   profile/weapons/abilities/keywords datasheet.
7. **Inventory** — grouped owned units, editable amounts, add-to-inventory.
8. **Army detail** — order of battle, add/remove units, points total.
9. **Points limit + validation panel** — surface `points_limit` (progress vs
   limit) and `GET …/validate` issues (over-points, wrong-faction/subfaction) on
   the army view.
10. **Shortfall** — a "what to buy" panel diffing an army against inventory
    (`GET …/validate`-sibling `shortfall`).
11. **Richer New Army** — subfaction (from `GET /factions/taxonomy`), description,
    points-limit fields.
12. **Polish** — optimistic mutations, skeleton loaders, keyboard/focus handling
    on modal, responsive breakpoints, `npm run gen:api` script, tests (Vitest +
    MSW).

## Out of scope (not MVP)

- Admin/catalog authoring (units/weapons/abilities CRUD) — the catalog is
  admin-curated on the backend; the app is read-only against it.
- Datasheet versioning, wargear/loadout modelling, list sharing/export, and
  game/match tracking — all out of scope on the backend too.
- Offline support / PWA, i18n, and a design-system theming layer beyond the single
  imported look.
