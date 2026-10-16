/* Typed test fixtures, so a stub cannot claim a shape the API never returns.
 *
 * ROADMAP F4: a stub answers whatever the test author expected, so a suite can be
 * fully green against a contract the real backend does not honour. The helper
 * every test file used took `body: unknown`, which meant `{ id: 'u1' }` stood in
 * for a `Unit_Read` with fifteen required fields — it typechecked, it passed, and
 * it proved nothing about the real response.
 *
 * These builders are typed against `src/api/types.ts`, which re-exports the
 * schema generated from the backend's own `openapi.json` (F2). So a backend field
 * rename stops these compiling, and every test that lied about the shape is
 * listed by one `tsc` run rather than discovered at runtime.
 *
 * Each takes a `Partial` override, so a test still says only what it cares about
 * while the rest of the shape stays real.
 */

import type {
  Ability_Read,
  Army_Read,
  ArmyUnit_Read,
  Faction_Read,
  KillTeam_Detail,
  KillTeam_Read,
  KillTeamRule_Read,
  KTAbility_Read,
  KTEquipment_Read,
  KTFaction_Read,
  KTGame_ListRead,
  KTGame_Read,
  KTGameAbility_Read,
  KTGameEquipment_Read,
  KTGameEvent_Read,
  KTGameOperative_Read,
  KTGamePloy_Read,
  KTGameRule_Read,
  KTGameWeapon_Read,
  KTOperative_ListRead,
  KTPloy_Read,
  KTRoster_ListRead,
  KTRoster_Read,
  KTRosterOperative_Read,
  KTSelectionRule_Read,
  KTWeapon_Read,
  Page,
  Shortfall_Read,
  Token,
  Unit_Read,
  UnitFacets,
  User_Read,
  UserUnit_Read,
  Validation_Read,
  Universal_Read,
  Weapon_Read,
} from '../api/types'

/** The one error shape every non-2xx carries (backend ROADMAP R9). Not in the
 *  generated schema: the backend builds error bodies by hand in its exception
 *  handlers, so FastAPI never publishes them. */
export interface ApiErrorBody {
  detail: string
  code?: string
  field?: string | null
  request_id?: string
  errors?: { code: string; field: string | null; detail: string }[]
}

/** Every body the API can actually return.
 *
 * This union is what makes the helper *constrain* rather than merely annotate. A
 * plain `jsonResponse<T>(body: T)` infers `T` from whatever it is handed, so
 * `{ id: 'u9' }` standing in for a fifteen-field `Unit_Read` still compiles —
 * which is the exact lie F4 is about. Constrained to this union, a literal that
 * matches no real response shape fails the typecheck. */
type ApiBody =
  | Unit_Read
  | Army_Read
  | Faction_Read
  | User_Read
  | UserUnit_Read
  | ArmyUnit_Read
  | Weapon_Read
  | Ability_Read
  | Validation_Read
  | UnitFacets
  | Token
  | ApiErrorBody
  | Shortfall_Read[]
  | KTFaction_Read
  | KillTeam_Read
  | KillTeam_Detail
  | KTOperative_ListRead
  | Universal_Read
  | KTSelectionRule_Read[]
  | Page<Unit_Read>
  | Page<Army_Read>
  | Page<Faction_Read>
  | Page<UserUnit_Read>
  | KTRoster_ListRead
  | KTRoster_Read
  | KTRosterOperative_Read
  | Page<KTFaction_Read>
  | Page<KillTeam_Read>
  | Page<KTOperative_ListRead>
  | Page<KTRoster_ListRead>
  | KTGame_Read
  | KTGame_ListRead
  | KTGameOperative_Read
  | KTGameEquipment_Read
  | Page<KTGame_ListRead>

/** A JSON `Response` whose body must be a shape the API can really return. */
export function jsonResponse<T extends ApiBody>(body: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** The pagination envelope every collection returns (backend ROADMAP R4). */
export function page<T>(items: T[], over: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, limit: 50, offset: 0, ...over }
}

export function makeUnit(over: Partial<Unit_Read> = {}): Unit_Read {
  return {
    id: 'u1',
    unit_name: 'Intercessor',
    faction_id: 'f1',
    subfaction_id: null,
    movement: 6,
    toughness: 4,
    armor_save: 3,
    wounds: 2,
    invulnerable_save: null,
    leadership: 6,
    objective_control: 1,
    points: 100,
    keywords: [],
    weapons: [],
    abilities: [],
    ...over,
  }
}

export function makeFaction(over: Partial<Faction_Read> = {}): Faction_Read {
  return { id: 'f1', name: 'Imperium', subfactions: [], ...over }
}

export function makeArmy(over: Partial<Army_Read> = {}): Army_Read {
  return {
    id: 'a1',
    name: 'The Hollow Vigil',
    faction_id: 'f1',
    subfaction_id: null,
    description: null,
    points_limit: null,
    created_at: '2026-01-01T00:00:00Z',
    points_total: 0,
    units: [],
    ...over,
  }
}

export function makeArmyUnit(over: Partial<ArmyUnit_Read> = {}): ArmyUnit_Read {
  return { unit: makeUnit(), amount: 1, ...over }
}

export function makeUserUnit(over: Partial<UserUnit_Read> = {}): UserUnit_Read {
  return { unit: makeUnit(), amount: 1, ...over }
}

export function makeUser(over: Partial<User_Read> = {}): User_Read {
  return { id: 'user-1', username: 'kesh', email: 'kesh@x.io', is_admin: false, ...over }
}

export function makeFacets(over: Partial<UnitFacets> = {}): UnitFacets {
  return { total: 0, by_faction: {}, ...over }
}

export function makeValidation(over: Partial<Validation_Read> = {}): Validation_Read {
  return { ok: true, points_total: 0, points_limit: null, issues: [], ...over }
}

// ---- Kill Team (ROADMAP KF2) ----
//
// `position` is set explicitly everywhere a collection is built, because printed
// order is the catalog's whole ordering contract (KILLTEAM.md #25) and a fixture
// that left it at a default would make an ordering assertion unfalsifiable.

export function makeKTFaction(over: Partial<KTFaction_Read> = {}): KTFaction_Read {
  return { id: 'ktf1', name: 'Tyranids', ...over }
}

export function makeKillTeam(over: Partial<KillTeam_Read> = {}): KillTeam_Read {
  return { id: 'kt1', name: 'Raveners', faction_id: 'ktf1', ...over }
}

export function makeKTWeapon(over: Partial<KTWeapon_Read> = {}): KTWeapon_Read {
  return {
    id: 'ktw1',
    name: 'Scything talons',
    category: 'melee',
    range: 0,
    attacks: 5,
    hit: 3,
    normal_damage: 4,
    crit_damage: 5,
    weapon_rules: [],
    position: 0,
    ...over,
  }
}

export function makeKTAbility(over: Partial<KTAbility_Read> = {}): KTAbility_Read {
  return { id: 'kta1', name: 'Pounce', description: 'A printed ability.', position: 0, ...over }
}

export function makeKTOperative(
  over: Partial<KTOperative_ListRead> = {},
): KTOperative_ListRead {
  return {
    id: 'kto1',
    name: 'Ravener Warrior',
    apl: 2,
    move: 6,
    save: 4,
    wounds: 12,
    keywords: ['RAVENER', 'TYRANID'],
    availability: 'roster',
    position: 0,
    weapons: [makeKTWeapon()],
    abilities: [makeKTAbility()],
    kill_team_id: 'kt1',
    ...over,
  }
}

export function makeKillTeamRule(over: Partial<KillTeamRule_Read> = {}): KillTeamRule_Read {
  return { id: 'ktr1', name: 'Burrow', description: 'A printed rule.', group: null, position: 0, ...over }
}

export function makeKTPloy(over: Partial<KTPloy_Read> = {}): KTPloy_Read {
  return {
    id: 'ktp1',
    name: 'Predatory Instincts',
    kind: 'strategy',
    cp_cost: 1,
    description: 'A printed ploy.',
    position: 0,
    ...over,
  }
}

export function makeKTEquipment(over: Partial<KTEquipment_Read> = {}): KTEquipment_Read {
  return { id: 'kte1', name: 'Grisly Trophy', description: 'A printed piece.', position: 0, ...over }
}

export function makeKTSelectionRule(
  over: Partial<KTSelectionRule_Read> = {},
): KTSelectionRule_Read {
  return { id: 'kts1', position: 0, depth: 0, kind: 'heading', text: 'Select', ...over }
}

export function makeKillTeamDetail(over: Partial<KillTeam_Detail> = {}): KillTeam_Detail {
  return {
    id: 'kt1',
    name: 'Raveners',
    faction_id: 'ktf1',
    // Two of each where order is the point, and NAMED so that printed order and
    // alphabetical order disagree. A fixture with one row, or with rows that happen
    // to be alphabetical, cannot fail an ordering assertion.
    //
    // What this does NOT pin, and a reader should not assume it does: every
    // collection here has its array order equal to its `position` order, so a test
    // built on it proves "the view does not re-sort" and cannot tell that apart from
    // "the view sorts by position". That is the frontend's actual contract -- the
    // server sends position order and the client renders what it was sent (#25) --
    // and `test_the_view_renders_the_order_it_was_sent` pins it with a collection
    // whose two orders disagree.
    rules: [
      makeKillTeamRule({ id: 'ktr1', name: 'Tunnel', position: 0 }),
      makeKillTeamRule({ id: 'ktr2', name: 'Burrow', position: 1 }),
    ],
    // FIREFIGHT printed first, and the two costs differ. Both are deliberate. With
    // strategy at position 0 the printed order happened to equal group-by-kind order,
    // so a view that grouped by kind was indistinguishable from one that read
    // `position`; and with both ploys at the default 1 CP, a view that hardcoded the
    // cost passed. Neither now.
    ploys: [
      makeKTPloy({ id: 'ktp1', name: 'Lurking Horror', kind: 'firefight', cp_cost: 2, position: 0 }),
      makeKTPloy({ id: 'ktp2', name: 'Predatory Instincts', kind: 'strategy', cp_cost: 1, position: 1 }),
    ],
    equipment: [
      makeKTEquipment({ id: 'kte1', name: 'Grisly Trophy', position: 0 }),
      makeKTEquipment({ id: 'kte2', name: 'Chameleonic Mutation', position: 1 }),
    ],
    // `KTOperative_ListRead` is `KTOperative_Read` plus `kill_team_id`, so one
    // builder serves both reads; the extra field is harmless here.
    operatives: [
      // Printed first but alphabetically second, which is the whole point: the page
      // prints the leader first (#25) and "Ravener Prime" sorts after "Hormagaunt".
      makeKTOperative({ id: 'kto1', name: 'Ravener Prime', position: 0 }),
      makeKTOperative({ id: 'kto2', name: 'Hormagaunt', position: 1 }),
    ],
    // A heading, an indented line and its note — the three `kind`s a composition
    // actually renders differently (#44, #45, #30).
    selection_rules: [
      makeKTSelectionRule({ id: 'kts1', position: 0, depth: 0, kind: 'heading', text: 'Select' }),
      makeKTSelectionRule({ id: 'kts2', position: 1, depth: 1, kind: 'line', text: 'One LEADER' }),
      makeKTSelectionRule({ id: 'kts3', position: 2, depth: 1, kind: 'note', text: 'A footnote.' }),
    ],
    ...over,
  }
}

export function makeUniversal(over: Partial<Universal_Read> = {}): Universal_Read {
  return {
    ploys: [makeKTPloy({ id: 'ktp-u', name: 'Command Re-roll' })],
    equipment: [makeKTEquipment({ id: 'kte-u', name: 'Frag Grenade' })],
    ...over,
  }
}

export function makeKTRosterListRow(over: Partial<KTRoster_ListRead> = {}): KTRoster_ListRead {
  return {
    id: 'ktr-1',
    name: 'My Raveners',
    description: null,
    created_at: '2026-01-01T00:00:00Z',
    kill_team_id: 'kt1',
    // The LIST row carries both names outright, unlike the catalog's
    // `KillTeam_Read`, which carries only `faction_id` -- so a roster listing needs
    // no name lookup.
    kill_team_name: 'Raveners',
    faction_name: 'Tyranids',
    ...over,
  }
}

export function makeKTRosterOperative(
  over: Partial<KTRosterOperative_Read> = {},
): KTRosterOperative_Read {
  return { id: 'ktro-1', position: 0, operative: makeKTOperative(), ...over }
}

export function makeKTRoster(over: Partial<KTRoster_Read> = {}): KTRoster_Read {
  return {
    id: 'ktr-1',
    name: 'My Raveners',
    description: null,
    created_at: '2026-01-01T00:00:00Z',
    kill_team_id: 'kt1',
    kill_team_name: 'Raveners',
    faction_name: 'Tyranids',
    // TWO rows holding the SAME datacard, which is the roster's defining property
    // (#50): a row is one operative, add appends, and each row is addressed by its
    // own id. A fixture with one row per datacard could not fail a test about that.
    // Positions ascend but the names do not, so an ordering assertion is falsifiable.
    operatives: [
      makeKTRosterOperative({
        id: 'ktro-1',
        position: 0,
        operative: makeKTOperative({ id: 'kto1', name: 'Ravener Prime' }),
      }),
      makeKTRosterOperative({
        id: 'ktro-2',
        position: 1,
        operative: makeKTOperative({ id: 'kto2', name: 'Hormagaunt' }),
      }),
      makeKTRosterOperative({
        id: 'ktro-3',
        position: 2,
        operative: makeKTOperative({ id: 'kto2', name: 'Hormagaunt' }),
      }),
    ],
    rules: [makeKillTeamRule({ id: 'ktr-r1', name: 'Tunnel', position: 0 })],
    ploys: [makeKTPloy({ id: 'ktr-p1', name: 'Predatory Instincts', position: 0 })],
    equipment: [makeKTEquipment({ id: 'ktr-e1', name: 'Grisly Trophy', position: 0 })],
    universal_ploys: [makeKTPloy({ id: 'ktr-up1', name: 'Command Re-roll', position: 0 })],
    universal_equipment: [makeKTEquipment({ id: 'ktr-ue1', name: 'Frag Grenade', position: 0 })],
    ...over,
  }
}

/* ---- Kill Team games (ROADMAP KF4) ---- */

export function makeKTGameWeapon(over: Partial<KTGameWeapon_Read> = {}): KTGameWeapon_Read {
  return {
    name: 'Ravening claws',
    category: 'M',
    range: 0,
    attacks: 4,
    hit: 3,
    normal_damage: 3,
    crit_damage: 4,
    weapon_rules: ['Lethal 5+'],
    ...over,
  }
}

export function makeKTGameAbility(over: Partial<KTGameAbility_Read> = {}): KTGameAbility_Read {
  return { name: 'Burrow', description: 'A snapshotted ability.', ...over }
}

export function makeKTGameRule(over: Partial<KTGameRule_Read> = {}): KTGameRule_Read {
  return { name: 'Swarming Instincts', description: 'A snapshotted rule.', group: null, ...over }
}

export function makeKTGamePloy(over: Partial<KTGamePloy_Read> = {}): KTGamePloy_Read {
  return {
    name: 'Sudden Surge',
    kind: 'strategic',
    cp_cost: 1,
    description: 'A snapshotted ploy.',
    universal: false,
    ...over,
  }
}

export function makeKTGameEquipment(
  over: Partial<KTGameEquipment_Read> = {},
): KTGameEquipment_Read {
  return {
    id: 'ktge-1',
    equipment_id: 'kte1',
    name: 'Tunnel markers',
    text: 'Snapshotted equipment text.',
    revealed: false,
    position: 0,
    ...over,
  }
}

export function makeKTGameEvent(over: Partial<KTGameEvent_Read> = {}): KTGameEvent_Read {
  return {
    id: 'ktgev-1',
    sequence: 1,
    type: 'operative_updated',
    turning_point: 1,
    payload: {},
    undone_by: null,
    created_at: '2026-02-01T00:00:00Z',
    ...over,
  }
}

export function makeKTGameOperative(
  over: Partial<KTGameOperative_Read> = {},
): KTGameOperative_Read {
  return {
    id: 'ktgo-1',
    position: 0,
    operative_id: 'kto1',
    name: 'Ravener Prime',
    apl: 2,
    move: 6,
    save: 4,
    wounds: 12,
    keywords: ['RAVENER', 'TYRANID'],
    weapons: [makeKTGameWeapon()],
    abilities: [makeKTGameAbility()],
    current_wounds: 12,
    order: 'conceal',
    // `ck_kt_game_operative_status`: reserve / on_board / incapacitated. Snake_case,
    // and the schema publishes it as a bare `string`, so nothing rejects a wrong one.
    status: 'on_board',
    activated_in_turning_point: null,
    tokens: [],
    actions_used: [],
    source: 'roster',
    added_in_turning_point: null,
    ...over,
  }
}

/** A game mid-battle, built so the derivations KF4 makes are FALSIFIABLE.
 *
 * `makeKTRoster` holds two rows with the same datacard because that is the roster's
 * defining property; this does the equivalent for the game screen. Four properties
 * are deliberately arranged rather than defaulted:
 *
 *   - **`turning_point: 2`, with one operative activated in 2 and another in 1.**
 *     "Has it activated?" is a comparison against the game's own turning point, not
 *     a flag (#61) — `advance` clears nothing. A fixture where every activated row
 *     matched the current turning point would pass whether the screen compared or
 *     just checked for non-null.
 *   - **`initiative: null`** — "not yet rolled" (#62), which MUST NOT render as the
 *     opponent holding it.
 *   - **Two rows holding the same `operative_id`** (#50 carries into the game), so a
 *     test that addressed a row by its datacard instead of its own id would fail.
 *   - **One operative on 0 wounds and incapacitated**, since the service couples the
 *     two, and one on reduced wounds that is still fighting.
 *
 * `victory_points` and `markers` are non-empty with values no enum would contain:
 * the API leaves all three of those shapes free (#1, #21), so a client-side
 * vocabulary would be unable to express "Tunnel 3". */
export function makeKTGame(over: Partial<KTGame_Read> = {}): KTGame_Read {
  return {
    id: 'ktg-1',
    created_at: '2026-02-01T00:00:00Z',
    roster_id: 'ktr-1',
    kill_team_id: 'kt1',
    kill_team_name: 'Raveners',
    faction_name: 'Tyranids',
    opponent_name: 'Kesh',
    // `ck_kt_game_status`: setup / in_progress / finished. The underscore matters --
    // `advance` writes `in_progress`, and this fixture said `'in progress'`, which is
    // a value the backend's CHECK constraint forbids and no gate here can catch.
    status: 'in_progress',
    turning_point: 2,
    phase: 'firefight',
    initiative: null,
    command_points: 2,
    victory_points: { 'Crit op: Hold': 3, 'Tunnel network': 2 },
    opponent_victory_points: 4,
    markers: ['Tunnel 0', 'Tunnel 3'],
    // A list of OBJECTS, not names: `ploys_used` and `actions_used` are both
    // `array<object>` (#23). A fixture of bare strings typechecks against the
    // generated `{[key: string]: unknown}[]` in some positions but fails the zod
    // parse at runtime, which is how this was caught.
    ploys_used: [{ name: 'Sudden Surge', turning_point: 1 }],
    choices: { 'Accursed Gift': 'Mutation' },
    version: 7,
    equipment_limit: 4,
    operatives: [
      makeKTGameOperative({
        id: 'ktgo-1',
        position: 0,
        operative_id: 'kto1',
        name: 'Ravener Prime',
        current_wounds: 8,
        order: 'engage',
        activated_in_turning_point: 2,
        tokens: ['Poison'],
        actions_used: [{ name: 'Burrow', turning_point: 2 }],
      }),
      makeKTGameOperative({
        id: 'ktgo-2',
        position: 1,
        operative_id: 'kto2',
        name: 'Hormagaunt',
        current_wounds: 12,
        activated_in_turning_point: 1,
      }),
      makeKTGameOperative({
        id: 'ktgo-3',
        position: 2,
        operative_id: 'kto2',
        name: 'Hormagaunt',
        current_wounds: 0,
        status: 'incapacitated',
        activated_in_turning_point: null,
      }),
    ],
    equipment: [makeKTGameEquipment()],
    rules: [makeKTGameRule()],
    ploys: [makeKTGamePloy()],
    events: [makeKTGameEvent()],
    ...over,
  }
}

/** A row in the games list — NOT the snapshot. Carries no operatives by design. */
export function makeKTGameListRow(over: Partial<KTGame_ListRead> = {}): KTGame_ListRead {
  return {
    id: 'ktg-1',
    created_at: '2026-02-01T00:00:00Z',
    opponent_name: 'Kesh',
    status: 'in_progress',
    turning_point: 2,
    phase: 'firefight',
    kill_team_id: 'kt1',
    kill_team_name: 'Raveners',
    faction_name: 'Tyranids',
    victory_points: { 'Crit op: Hold': 3 },
    opponent_victory_points: 4,
    ...over,
  }
}
