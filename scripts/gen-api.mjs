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
import { readFileSync, writeFileSync } from 'node:fs'

const REPO = 'incaholy/Warhammer-unit'
const REF = process.env.OPENAPI_REF || 'main'
const OUT = 'src/api/schema.d.ts'
const ZOD_OUT = 'src/api/schemas.gen.ts'
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

// ---------------------------------------------------------------------------
// Runtime schemas, from the same document (ROADMAP F11).
//
// Generated rather than hand-written, deliberately. F11 names the risk of the
// alternative: two sources of truth for one shape drift, and then validation
// starts rejecting data the API legitimately sent. Both files come from one fetch
// of one document, and CI fails if either drifts from it.
// ---------------------------------------------------------------------------

const doc = JSON.parse(
  source.startsWith('http') ? await (await fetch(source)).text() : readFileSync(source, 'utf8'),
)
const schemas = doc.components?.schemas ?? {}

const refName = (ref) => ref.replace('#/components/schemas/', '')

/** One OpenAPI node -> one zod expression.
 *
 * Deliberately loose where strictness would cost more than it buys:
 *   - `format: uuid` / `date-time` stay `z.string()`. Validating the format would
 *     reject an id the API legitimately changed the shape of, which is the exact
 *     failure F11 warns about.
 *   - `integer` stays `z.number()` for the same reason.
 *   - objects are non-strict (zod's default), so a NEW field added by the backend
 *     is ignored rather than fatal. Additive changes must never break a client.
 */
function zodFor(node, indent = '  ') {
  if (!node || typeof node !== 'object') return 'z.unknown()'
  if (node.$ref) return refName(node.$ref)

  if (Array.isArray(node.anyOf)) {
    const nullable = node.anyOf.some((n) => n.type === 'null')
    const rest = node.anyOf.filter((n) => n.type !== 'null')
    if (rest.length === 0) return 'z.null()'
    const inner =
      rest.length === 1
        ? zodFor(rest[0], indent)
        : `z.union([${rest.map((n) => zodFor(n, indent)).join(', ')}])`
    return nullable ? `${inner}.nullable()` : inner
  }

  if (Array.isArray(node.enum)) {
    return `z.enum([${node.enum.map((v) => JSON.stringify(v)).join(', ')}])`
  }

  switch (node.type) {
    case 'string':
      return 'z.string()'
    case 'integer':
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    case 'null':
      return 'z.null()'
    case 'array':
      return `z.array(${zodFor(node.items, indent)})`
    case 'object': {
      if (node.additionalProperties && node.additionalProperties !== true) {
        return `z.record(z.string(), ${zodFor(node.additionalProperties, indent)})`
      }
      const props = Object.entries(node.properties ?? {})
      if (props.length === 0) return 'z.record(z.string(), z.unknown())'
      const required = new Set(node.required ?? [])
      const lines = props.map(([key, value]) => {
        const expr = zodFor(value, indent + '  ')
        // A property with a `default` is absent from `required` but always present
        // in a response -- the server fills it in. openapi-typescript treats those
        // as required, so this must too, or the runtime schema and the static type
        // disagree about the same field (`Token.token_type` is the live case).
        const isRequired = required.has(key) || value?.default !== undefined
        return `${indent}  ${JSON.stringify(key)}: ${expr}${isRequired ? '' : '.optional()'},`
      })
      return `z.object({\n${lines.join('\n')}\n${indent}})`
    }
    default:
      return 'z.unknown()'
  }
}

/** Emit in dependency order, so a schema never references one declared later. */
function order(names) {
  const deps = (name) => {
    const found = new Set()
    const walk = (n) => {
      if (!n || typeof n !== 'object') return
      if (n.$ref) found.add(refName(n.$ref))
      for (const key of ['anyOf', 'allOf', 'oneOf']) for (const s of n[key] ?? []) walk(s)
      for (const v of Object.values(n.properties ?? {})) walk(v)
      walk(n.items)
      if (typeof n.additionalProperties === 'object') walk(n.additionalProperties)
    }
    walk(schemas[name])
    return [...found]
  }
  const out = []
  const seen = new Set()
  const visit = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    for (const d of deps(name)) if (schemas[d]) visit(d)
    out.push(name)
  }
  for (const name of names) visit(name)
  return out
}

const header = `/* GENERATED by scripts/gen-api.mjs -- do not edit by hand.
 *
 * Runtime schemas for every response shape the API can return, generated from the
 * same openapi.json as schema.d.ts so the two cannot disagree (ROADMAP F11).
 * Run 'npm run gen:api'; CI fails if this file drifts from the backend.
 */

import { z } from 'zod'
`

/* Only response shapes. Request bodies (`*_Create`, `*_Update`, the link and
 * form models) are validated by the backend, not by us -- emitting them would put
 * dead schemas in the bundle, and this runs on every response so the weight is
 * real. Collected from the document's own response declarations, then closed over
 * their dependencies, so nothing referenced is missing. */
const responseRefs = new Set()
for (const methods of Object.values(doc.paths ?? {})) {
  for (const op of Object.values(methods)) {
    for (const res of Object.values(op?.responses ?? {})) {
      const schema = res?.content?.['application/json']?.schema
      if (schema?.$ref) responseRefs.add(refName(schema.$ref))
      if (schema?.type === 'array' && schema.items?.$ref) responseRefs.add(refName(schema.items.$ref))
    }
  }
}

const emitted = order([...responseRefs])
const body = emitted
  .map((name) => `export const ${name} = ${zodFor(schemas[name])}\n`)
  .join('\n')

writeFileSync(ZOD_OUT, `${header}\n${body}`)
console.log(`Generating ${ZOD_OUT} from the same document (${emitted.length} response schemas)`)
