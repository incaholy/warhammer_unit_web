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
what the user owns** — a list may include units not yet bought. The **backend loop
works today**; this app makes it usable in a browser. **Status: not yet built**
(planning phase — see the checklist).

## Status at a glance

**Planning.** The repo is a fresh Vite + React + TS scaffold. This SPEC/MVP pair
defines the build; no application code exists yet. The backend it targets is
feature-complete and **frontend-ready** (CORS, seed, typed errors, catalog reads
with `X-Total-Count`, OpenAPI schema).

## Parts of the system

| Part | Where | Status |
|---|---|---|
| App shell — providers, routing, auth gate, header/breadcrumbs | `src/App.tsx`, `src/main.tsx` | ☐ |
| Design system — tokens + global CSS | `src/styles/` | ☐ |
| HTTP client — base URL, JWT, `ApiError`, form-login, `X-Total-Count` | `src/api/client.ts` | ☐ |
| API types — generated from `/openapi.json` | `src/api/types.ts` | ☐ |
| Data layer — per-resource functions + Query hooks | `src/api/*`, `queries.ts` | ☐ |
| Auth/session — context, guard, login/signup | `src/auth/` | ☐ |
| UI kit — buttons, inputs, tags, modal, toast, header, breadcrumbs | `src/ui/` | ☐ |
| Views — collection, army, catalog, inventory, unit, auth | `src/views/` | ☐ |
| Dev proxy — Vite → `:8000` | `vite.config.ts` | ☐ |

## Views

| View | Route | Backing endpoints | Status |
|---|---|---|---|
| Auth (login / signup) | `/login` | `POST /auth/register`, `POST /auth/login` | ☐ |
| Collection (armies list/grid) | `/` | `GET /me/armies` | ☐ |
| Army detail (order of battle) | `/armies/:id` | `GET /me/armies/{id}`, add/remove units | ☐ |
| Catalog (browse + add) | `/catalog`, `/armies/:id/catalog` | `GET /factions`, `GET /units`, `POST …/units` / `POST /me/inventory` | ☐ |
| Inventory (owned units) | `/inventory` | `GET/POST/PATCH/DELETE /me/inventory` | ☐ |
| Unit datasheet | `/units/:id` | `GET /units/{id}` | ☐ |
| New Army modal | (overlay) | `POST /me/armies` | ☐ |

## Feature checklist

### To build 🔨 (MVP, ordered easiest-first — see SPEC.md "Roadmap")
- [ ] **Scaffold** — add `react-router-dom` + TanStack Query; `theme.css` /
  `global.css` from the design tokens; remove the Vite demo (`App.css`, demo
  `App.tsx`, `src/assets/*`).
- [ ] **HTTP client + types** — `client.ts` (base URL, `Authorization: Bearer`,
  JSON, `ApiError` from `{detail, field}`, OAuth2 **form** login, `204` handling,
  `X-Total-Count`); `types.ts` generated from OpenAPI.
- [ ] **Auth** — `AuthContext` (token in `localStorage`, `GET /me` hydrate),
  `RequireAuth` guard, `AuthView` (login = email+password, signup =
  name+email+password+confirm), 401 → `/login`. Vite dev proxy to `:8000`.
- [ ] **UI kit** — Button, Input, Field, Tag, SegmentedToggle, Modal, Toast,
  Header, Breadcrumbs, Eyebrow, EmptyState (extracted CSS, not inline styles).
- [ ] **Collection** — armies list/grid toggle (persisted), aggregate meta line,
  empty state; **New Army modal** (name + faction from `GET /factions`) →
  `POST /me/armies`.
- [ ] **Catalog** — faction filter rail (with counts), search (`q`), owned-only
  toggle, unit rows with **+ Add** to the active target (army or inventory),
  "N of M" from `X-Total-Count`, paging.
- [ ] **Unit datasheet** — 6-stat profile grid, ranged/melee weapon tables (split
  by `category`), abilities, keyword chips; context action (add-to-army or edit
  owned qty).
- [ ] **Inventory** — role-grouped collapsible sections, editable owned qty
  (`PATCH`), remove, add-to-inventory, models/datasheets meta, empty state.
- [ ] **Army detail** — order of battle grouped by derived role, ×qty, remove
  unit, add-from-catalog, `points_total`, empty state.
- [ ] **Role derivation** — `src/lib/roles.ts` maps `keywords[]` → a display role
  + grouping (backend has no role field).

### To add / harden ⚙️ (post-MVP — backend already supports)
- [ ] **Points limit + validation** — show `points_limit` progress and
  `GET /me/armies/{id}/validate` issues (over-points, wrong faction/subfaction).
- [ ] **Shortfall** — "what to buy" panel from `GET /me/armies/{id}/shortfall`.
- [ ] **Richer New Army** — subfaction (`GET /factions/taxonomy`), description,
  points-limit.
- [ ] **`npm run gen:api`** — script to regenerate types from `/openapi.json`.
- [ ] **Optimistic mutations + skeleton loaders**; modal focus-trap; responsive
  breakpoints.
- [ ] **Tests** — Vitest + React Testing Library + MSW (client behavior, role
  derivation, add-to-army/edit-amount flows).

## To fix 🐞
- (none yet — no code)

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
