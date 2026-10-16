# Warhammer Web — frontend

The web frontend for **Muster**, a Warhammer 40k army-list builder. Browse the
unit catalog, keep an inventory of the models you own, and assemble armies with
live points totals and validation. It's a single-page app that talks to the
`warhammer_unit` backend API.

**Stack:** React · TypeScript (strict) · Vite · React Query (`@tanstack/react-query`)
· React Router · Zod (runtime validation at the network boundary) · Vitest +
Testing Library.

## Quick start

Prerequisites: **Node.js** (a current LTS, 20+ recommended) and the
[`warhammer_unit` backend](../warhammer_unit) running locally on
`http://localhost:8000`.

```bash
npm install
cp .env.example .env     # optional; leave VITE_API_BASE_URL empty for local dev
npm run dev              # Vite dev server on http://localhost:5173
```

In dev the Vite server **proxies** `/api` to `localhost:8000`, so the browser sees
a single origin and no CORS is involved — just start the backend first. Every
resource route lives under that one prefix (`/api/v1/...`), which is why the proxy
needs a single entry rather than one per resource.

```bash
npm test                # run the test suite once
```

### API base URL

`VITE_API_BASE_URL` is a **build-time** variable baked into the bundle:

- **Empty / unset** → same origin. Used in local dev (the proxy above) and any
  same-domain deploy.
- **A full origin** (e.g. `https://your-backend.run.app`, no trailing slash) →
  a cross-origin deploy, such as a Firebase-hosted frontend against a Cloud Run
  backend.

See `.env.example`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (HMR) on `:5173`. |
| `npm run build` | Type-check (`tsc -b`) then produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run lint` | Lint with ESLint. |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` from the backend's published `openapi.json`. Set `OPENAPI_REF` to target a backend branch. CI verifies it is fresh. |

## Layout

```
src/
  api/       one module per backend resource (units, armies, inventory, factions, auth),
             plus client.ts (fetch wrapper + zod error parsing), queries.ts (React Query
             hooks), and types.ts (the API contract types)
  views/     route-level screens (Catalog, Collection, Army, Auth) with CSS modules
  ui/        the shared design-system components (Button, Input, Tag, …)
  lib/       framework-free helpers (errors, formatting, keyword→role derivation)
  auth/      auth context / token handling
  toast/     toast notifications
  styles/    global styles and tokens
  test/      Vitest setup
```

Every network call goes through `src/api/client.ts`, which validates error
bodies with Zod and surfaces the backend's normalized `{detail, code, field?}`
shape; `src/lib/errors.ts` turns those into user-facing messages.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md): the normative frontend architecture. The
  structural decisions, and whether anything enforces each one. Read this before
  making a structural change.
- [`ROADMAP.md`](ROADMAP.md): the gap between that target and the code today,
  ordered by value per unit of effort.
- [`SPEC.md`](SPEC.md): the frontend specification. Routing, views, the design
  language, and the build roadmap.
- [`MVP.md`](MVP.md): what the minimal product is and what's built.
- [`CODE-REVIEW.md`](CODE-REVIEW.md): a correctness review of both repos.

Backend and deployment docs live in the
[`Warhammer-unit`](https://github.com/incaholy/Warhammer-unit) repo, which keeps
its own `ARCHITECTURE.md` and `ROADMAP.md` for the API.
