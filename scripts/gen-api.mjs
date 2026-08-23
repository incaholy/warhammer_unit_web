/* Regenerate src/api/schema.d.ts from the backend's OpenAPI document.
 *
 * The source is a URL, not a sibling checkout. A filesystem path like
 * `../warhammer_unit/openapi.json` only resolves if a second repo happens to be
 * cloned next door under an exact name, and it can never resolve in CI, which
 * checks out one repository — so the freshness gate this script exists to enable
 * would have been impossible to write. See ROADMAP F2.
 *
 * The backend generates that file from the app (`make openapi`) and its own CI
 * fails if it is stale, so whatever this fetches is guaranteed current at source.
 *
 * Which ref? The backend branch that ships with this frontend branch. CI passes
 * the current branch name, so `roadmap` here reads `roadmap` there, and once both
 * merge, `main` reads `main` — no step to remember to undo. A ref that does not
 * exist in the backend (a feature branch with no counterpart) falls back to main.
 *
 * Override either half:
 *   OPENAPI_REF=roadmap npm run gen:api
 *   OPENAPI_URL=http://localhost:8000/openapi.json npm run gen:api   (local file works too)
 */

import { execFileSync } from 'node:child_process'

const REPO = 'incaholy/Warhammer-unit'
const REF = process.env.OPENAPI_REF || 'main'
const OUT = 'src/api/schema.d.ts'
const explicitUrl = process.env.OPENAPI_URL
const rawUrl = (ref) => `https://raw.githubusercontent.com/${REPO}/${ref}/openapi.json`

/** HEAD the URL so a bad ref reports itself, rather than openapi-typescript
 *  failing to parse GitHub's 404 body. */
async function reachable(url) {
  const res = await fetch(url, { method: 'HEAD' }).catch((err) => {
    console.error(`\nCould not reach ${url}\n  ${err.message}`)
    console.error('If you are offline, point at a local copy:')
    console.error('  OPENAPI_URL=../warhammer_unit/openapi.json npm run gen:api\n')
    process.exit(1)
  })
  return res.ok
}

let source = explicitUrl ?? rawUrl(REF)
if (!explicitUrl && !(await reachable(source))) {
  if (REF === 'main') {
    console.error(`\n${source} returned a non-OK status. Does the backend still publish openapi.json?\n`)
    process.exit(1)
  }
  // A frontend branch with no backend counterpart: main is the contract.
  console.warn(`No openapi.json on backend ref "${REF}"; falling back to main.`)
  source = rawUrl('main')
  if (!(await reachable(source))) {
    console.error(`\n${source} is unreachable too.\n`)
    process.exit(1)
  }
}

console.log(`Generating ${OUT} from ${source}`)
execFileSync('npx', ['openapi-typescript', source, '-o', OUT], { stdio: 'inherit' })
