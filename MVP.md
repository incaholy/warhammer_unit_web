# MVP — Muster Frontend

A tracking doc for the minimal viable product of the **Muster** web UI: what the
parts are, what's built, what still needs building, and what needs fixing.
Architecture, the design system, and per-view/API detail live in
[SPEC.md](SPEC.md); this file is the feature/status checklist.

## What it is

The browser client for the Warhammer 40k **army-list builder** — the presentation
layer over the `warhammer_unit` FastAPI backend. Three ideas, all served by the
API, rendered here:

- browse a shared, read-only **catalog** of datasheets (factions → subfactions →
  units, with weapons + abilities);
- record each user's **inventory** — the models they physically own; and
- build each user's **armies** — points-costed, rules-checked rosters.

Everything is behind JWT auth: a user sees only their own data; the catalog is
admin-curated on the backend and read-only here.

Built with **Vite + React + TypeScript**, styled from an imported Claude Design
project ("Muster — Collection Index"): an editorial / brutalist look — paper
background, near-black ink, hairline borders, serif display headings, monospaced
uppercase labels.

## The core loop (definition of "viable")

`register → log in → browse the catalog → record what you own → build army lists
→ read points / shortfall / validity`. Building army lists is **independent of
what the user owns** — a list may include units not yet bought. **This loop is
built and works** — every screen is wired to the real API, and the full contract
has been verified end-to-end against the live backend.

## Status at a glance

**Built.** The full SPEC roadmap (steps 1–12) is complete plus post-roadmap
hardening (toasts, error boundary, code-splitting, CI). **144 tests pass**, lint
+ build clean, and the frontend↔backend contract is verified against a running,
seeded backend (1,332 units). Remaining work is deploy-time config and a few
deferred niceties (see below).

## Parts of the system

| Part | Where | Status |
|---|---|---|
| App shell — providers, routing, auth gate, header/breadcrumbs | `src/App.tsx`, `src/main.tsx` | ✅ |
| Design system — tokens + global CSS | `src/styles/` | ✅ |
| HTTP client — base URL, JWT, `ApiError`, form-login, `X-Total-Count` | `src/api/client.ts` | ✅ |
| API types — hand-written, verified vs `/openapi.json` (gen:api deferred) | `src/api/types.ts` | ✅ |
| Data layer — per-resource functions + Query hooks | `src/api/*`, `queries.ts` | ✅ |
| Auth/session — context, guard, login/signup | `src/auth/` | ✅ |
| Toasts — bus + provider, wired to mutation outcomes | `src/toast/` | ✅ |
| UI kit — buttons, inputs, tags, modal, toast, header, breadcrumbs, error boundary | `src/ui/` | ✅ |
| Views — collection, army, catalog, inventory, unit, auth | `src/views/` | ✅ |
| Dev proxy — Vite → `:8000` | `vite.config.ts` | ✅ |
| CI — GitHub Actions (lint + build + test) | `.github/workflows/ci.yml` | ✅ |

## Views

| View | Route | Backing endpoints | Status |
|---|---|---|---|
| Auth (login / signup) | `/login` | `POST /auth/register`, `POST /auth/login` | ✅ |
| Collection (armies list/grid) | `/` | `GET /me/armies` | ✅ |
| Army detail (order of battle + validation + shortfall) | `/armies/:id` | `GET /me/armies/{id}`, add/remove units, `/validate`, `/shortfall` | ✅ |
| Catalog (browse + add) | `/catalog`, `/armies/:id/catalog` | `GET /factions`, `GET /units`, `POST …/units` / `POST /me/inventory` | ✅ |
| Inventory (owned units) | `/inventory` | `GET/POST/PATCH/DELETE /me/inventory` | ✅ |
| Unit datasheet | `/units/:id` | `GET /units/{id}` | ✅ |
| New Army modal (name, faction, subfaction, description, points-limit) | (overlay) | `POST /me/armies` | ✅ |

## Feature checklist

### Built ✅ (MVP)
- [x] **Scaffold** — `react-router-dom` + TanStack Query; `theme.css` /
  `global.css` from the design tokens; Vite demo removed.
- [x] **HTTP client + types** — `client.ts` (base URL, `Authorization: Bearer`,
  JSON, `ApiError` from `{detail, field}`, OAuth2 **form** login, `204` handling,
  `X-Total-Count`); hand-written `types.ts` (verified against live `/openapi.json`).
- [x] **Auth** — `AuthContext` (token in `localStorage`, `GET /me` hydrate),
  `RequireAuth` guard, `AuthView`, 401 → `/login`, Vite dev proxy to `:8000`.
- [x] **UI kit** — Button, Input, Field, Tag, SegmentedToggle, Modal (focus-trap),
  Toast, Header, Breadcrumbs, Eyebrow, EmptyState (extracted CSS Modules).
- [x] **Collection** — armies list/grid toggle (persisted), aggregate meta, empty
  state; **New Army modal** → `POST /me/armies`.
- [x] **Catalog** — faction filter rail (with counts), search (`q`), owned-only
  toggle, target-aware **+ Add**, "N of M" from `X-Total-Count`, paging.
- [x] **Unit datasheet** — 6-stat profile grid, ranged/melee weapon tables,
  abilities, keyword chips; optional context action.
- [x] **Inventory** — role-grouped collapsible sections, debounced editable qty,
  remove, add-to-inventory, meta, empty state.
- [x] **Army detail** — order of battle grouped by derived role, ×qty, remove,
  add-from-catalog, `points_total`, empty state.
- [x] **Role derivation** — `src/lib/roles.ts` maps `keywords[]` → display role +
  grouping.
- [x] **Routing + breadcrumbs** — route table behind `RequireAuth` in a Header
  shell; route-structural breadcrumbs.

### Built ✅ (post-MVP — backend already supported)
- [x] **Points limit + validation** — `points_limit` progress + `/validate`
  issues panel (over-points, wrong faction/subfaction), with `progressbar` a11y.
- [x] **Shortfall** — "what to buy" panel from `/shortfall`.
- [x] **Richer New Army** — subfaction (dependent select), description, points-limit.
- [x] **Polish** — loading skeletons, responsive breakpoints (~360px+),
  reduced-motion, keyboard a11y, modal focus-trap.
- [x] **Toasts** — mutation outcomes surfaced centrally (success + error).
- [x] **Error boundary** — render-error fallback instead of a blank screen.
- [x] **Route-level code splitting** — `React.lazy` per view.
- [x] **Tests** — Vitest + React Testing Library (client, roles, all views, auth,
  routing, toasts, error boundary) — 144 tests.
- [x] **CI** — GitHub Actions: lint + build + test on push/PR to `main`.

### To add / harden ⚙️ (deferred)
- [ ] **Set a real deploy config** — `VITE_API_BASE_URL` for cross-origin, plus
  the backend's `SECRET_KEY` / `ALLOWED_ORIGINS` (deploy-time, not code).
- [ ] **`npm run gen:api`** — migrate `types.ts` to `openapi-typescript` output
  (hand-written types are verified correct, so this is drift-protection, not a fix).
- [ ] **Optimistic mutations** — currently invalidate-and-refetch; optimistic UI
  would make add/remove feel instant.
- [ ] **Entity-name breadcrumbs** — crumbs are route-structural ("Army"/"Datasheet")
  rather than the actual army/unit names.
- [ ] **Full browser e2e** — a Playwright smoke walk of the core loop (unit tests
  use mocked APIs; the HTTP contract is curl-verified against the live backend).

## To fix 🐞
- [ ] **`Army_Read` has no `created_at`** — the Army view omits the "Created" date
  until the backend exposes it. (Backend change.)
- [ ] **Inventory search is client-side only** — `listInventory()` takes no `q`
  param, so filtering happens in the browser.

## Decisions locked
- **Full app wired to the backend** (not a mock-data visual port) — every view
  calls the real API.
- **Extracted theme + CSS** (design tokens as CSS variables + CSS Modules), not
  the design's verbatim inline styles.
- **Option B connection** — relative URLs + Vite dev proxy; CORS is a fallback.
- **JWT in `localStorage`**, Bearer header (no cookies → no CSRF concern).

## Out of scope (not MVP)
- Admin / catalog authoring (units, weapons, abilities, factions) — the app is
  read-only against the admin-curated catalog.
- Datasheet **versioning**, **wargear/loadout** modelling, list **sharing/export**,
  game/match tracking — out of scope on the backend too.
- Offline/PWA, i18n, refresh-token flow, and multi-theme support.
