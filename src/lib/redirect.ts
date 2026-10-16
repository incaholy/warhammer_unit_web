/* Where to land after signing in. See ROADMAP F6. */

/** The post-login destination: the page the guard bounced us from, or home.
 *
 * Only ever an **internal** path. A destination that reaches a redirect from
 * anywhere user-influenced is an open redirect — a phisher points it at their own
 * domain and the victim arrives there from a link that genuinely started on this
 * site. Router state is not user-craftable the way a query parameter is, but the
 * check costs two comparisons and means the rule does not depend on that staying
 * true. `//evil.example` is rejected too: a protocol-relative URL starts with `/`
 * and is external. */
export function redirectTarget(from: unknown): string {
  if (typeof from !== 'string') return '/'
  if (!from.startsWith('/') || from.startsWith('//')) return '/'
  return from
}
