/* KillTeamRosterView (`/kill-team/rosters/:rosterId`) — one roster, and the writes
 * a player makes on it. See ROADMAP.md → KF3, and KILLTEAM.md #20, #50, #51, #52,
 * #53, #55, #60.
 *
 * AUTHENTICATED. Another player's roster is a 404 rather than a 403, so an id
 * reveals nothing about whether it exists.
 *
 * ONE request for the screen itself. `KTRoster_Read` carries the rows with their
 * datacards, the team's rules, ploys and equipment, and BOTH universal lists (#52),
 * so the Reference tab costs nothing. The picker is the one extra read: the pool of
 * datacards to add FROM is the catalog's, not the roster's.
 *
 * Two rows can hold the same datacard (#50), so a row is addressed by its own id and
 * numbered by its place in the list — never by `row.position`, which is a sort hint
 * that is neither contiguous nor distinct (#53). */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  useAddRosterOperative,
  useDeleteRoster,
  useKillTeam,
  useKTOperatives,
  useMoveRosterOperative,
  useRemoveRosterOperative,
  useRoster,
  useUpdateRoster,
} from '../api/killTeamQueries'
import { ApiError } from '../api/client'
import { NotFound } from './NotFound'
import type { KTRoster_Read, KTRosterOperative_Read, UUID } from '../api/types'
import { withReference } from '../lib/errors'
import { pluralize } from '../lib/format'
import { Button, Eyebrow, Input, Modal, TabPanel, Tabs, Tag, type Tab } from '../ui'
import { Abilities, Composition, Keywords, Reference, StatLine, Weapons } from './killTeamCards'
import styles from './KillTeamRosterView.module.css'

type TabId = 'operatives' | 'reference'

const TABS: Tab<TabId>[] = [
  { id: 'operatives', label: 'Operatives' },
  { id: 'reference', label: 'Reference' },
]

export default function KillTeamRosterView() {
  const { rosterId = '' } = useParams()
  const [tab, setTab] = useState<TabId>('operatives')
  const rosterQuery = useRoster(rosterId)

  if (rosterQuery.isPending) {
    return (
      <section className={styles.view}>
        <div role="status" aria-label="Loading roster">
          <span className={styles.srOnly}>Loading roster…</span>
          <div aria-hidden="true">
            <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
            <span className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
          </div>
        </div>
      </section>
    )
  }

  if (rosterQuery.isError || !rosterQuery.data) {
    const missing = rosterQuery.error instanceof ApiError && rosterQuery.error.code === 'NOT_FOUND'
    // Same screen as a mistyped URL (F13 tier 3): to the player, a roster that was
    // deleted and a roster that never existed are one answer.
    if (missing) return <NotFound what="roster" />
    return (
      <section className={styles.view}>
        <p role="alert" className={styles.error}>
          {withReference("Couldn't load this roster.", rosterQuery.error)}
        </p>
        <Link to="/kill-team/rosters" className={styles.back}>
          ← Your rosters
        </Link>
      </section>
    )
  }

  const roster = rosterQuery.data

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <Eyebrow>
          {roster.kill_team_name} · {roster.faction_name}
        </Eyebrow>
        <RosterName roster={roster} />
        {roster.description && <p className={styles.desc}>{roster.description}</p>}
        <p className={styles.meta}>
          {pluralize(roster.operatives.length, 'operative')} ·{' '}
          <Link to={`/kill-team/teams/${roster.kill_team_id}`} className={styles.teamLink}>
            View the kill team
          </Link>
        </p>
      </header>

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        aria-label="Roster sections"
        idPrefix="roster"
      />

      {tab === 'operatives' && (
        <TabPanel id="operatives" idPrefix="roster">
          <Operatives rosterId={roster.id} rows={roster.operatives} />
          {/* Between the rows and the picker, so the question "what can I still take?"
            * and its answer are in one place. It was first planned as a third tab, which
            * was wrong: the point is not having to navigate away to remember what is
            * valid, and a tab IS navigating away. */}
          <RosterComposition killTeamId={roster.kill_team_id} />
          <AddOperative rosterId={roster.id} killTeamId={roster.kill_team_id} />
        </TabPanel>
      )}

      {tab === 'reference' && (
        <TabPanel id="reference" idPrefix="roster">
          {/* Straight from the roster read — #52 puts both universal lists in it, so
            * unlike the team page this needs no second request. */}
          <Reference
            rules={roster.rules}
            ploys={roster.ploys}
            equipment={roster.equipment}
            universalPloys={roster.universal_ploys}
            universalEquipment={roster.universal_equipment}
          />
        </TabPanel>
      )}

      <DeleteRoster roster={roster} />
    </section>
  )
}

/** Inline rename, mirroring `ArmyView`'s.
 *
 * One difference from that precedent, and it runs the other way: here the SERVER
 * enforces a non-empty name. `KTRoster_Update.name` carries
 * `minLength: 1, maxLength: 128`, where `Army_Update.name` carries no constraint at
 * all — so the 40k version must guard or a blank gets written, and this one guards
 * only to avoid a pointless round trip and a 422 toast. */
function RosterName({ roster }: { roster: KTRoster_Read }) {
  const updateRoster = useUpdateRoster(roster.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(roster.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focused by an effect rather than `autoFocus`: focus moved by an action the user
  // took, not stolen on render.
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function save() {
    // Guarded here and not only on the button, because Enter reaches this directly —
    // three quick presses would otherwise be three PATCHes and three toasts.
    if (updateRoster.isPending) return
    const name = draft.trim()
    if (!name || name === roster.name) return setEditing(false)
    updateRoster.mutate({ name }, { onSuccess: () => setEditing(false) })
  }

  if (!editing) {
    return (
      <div className={styles.nameRow}>
        <h1 className={styles.title}>{roster.name}</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(roster.name)
            setEditing(true)
          }}
          aria-label={`Rename ${roster.name}`}
        >
          Rename
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.nameRow}>
      <Input
        ref={inputRef}
        aria-label="Roster name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <Button size="sm" onClick={save} disabled={updateRoster.isPending}>
        {updateRoster.isPending ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  )
}

function Operatives({ rosterId, rows }: { rosterId: UUID; rows: KTRosterOperative_Read[] }) {
  const move = useMoveRosterOperative(rosterId)
  const remove = useRemoveRosterOperative(rosterId)

  if (rows.length === 0) {
    return <p className={styles.quiet}>No operatives yet. Add one below.</p>
  }

  // Disabled across EVERY row while a move is in flight, not just the row clicked: a
  // move is two PATCHes on two rows, so a second move started in between would
  // compute its swap from positions that are mid-change.
  const moving = move.isPending

  return (
    <ol className={styles.rows}>
      {rows.map((row, index) => (
        <li key={row.id} className={styles.row}>
          <div className={styles.rowHead}>
            {/* The ORDINAL, not `row.position` — see the note at the top of the file. */}
            <span className={styles.ordinal} data-testid="row-ordinal">
              {index + 1}
            </span>
            <h2 className={styles.rowName}>{row.operative.name}</h2>
            {row.operative.availability === 'in_battle' && <Tag>In battle only</Tag>}

            {/* Every action is named by POSITION as well as by datacard, because two
              * rows can hold the same one (#50) — "Move Hormagaunt up" is ambiguous
              * twice over on the very fixture this is tested against, and a keyboard
              * user would have no way to tell which row they were acting on. */}
            <div className={styles.rowActions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={moving || index === 0}
                aria-label={`Move ${row.operative.name} at position ${index + 1} up`}
                onClick={() => move.mutate({ row, swapWith: rows[index - 1] })}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={moving || index === rows.length - 1}
                aria-label={`Move ${row.operative.name} at position ${index + 1} down`}
                onClick={() => move.mutate({ row, swapWith: rows[index + 1] })}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                // Named by POSITION as well as by datacard, because two rows can hold
                // the same one (#50) — "Remove Hormagaunt" is ambiguous twice over on
                // the very fixture this is tested against.
                aria-label={`Remove ${row.operative.name} at position ${index + 1}`}
                onClick={() => remove.mutate(row.id)}
              >
                Remove
              </Button>
            </div>
          </div>

          <StatLine operative={row.operative} />

          {/* Collapsed by default: a roster of ten would be unreadable with every
            * weapon table open. `<details>` rather than a toggle, so it works
            * without JavaScript and is keyboard-reachable for free. */}
          {(row.operative.weapons.length > 0 || row.operative.abilities.length > 0) && (
            <details className={styles.profile}>
              <summary className={styles.summary}>Datacard</summary>
              {row.operative.weapons.length > 0 && <Weapons weapons={row.operative.weapons} />}
              {row.operative.abilities.length > 0 && (
                <Abilities abilities={row.operative.abilities} />
              )}
              <Keywords keywords={row.operative.keywords} />
            </details>
          )}
        </li>
      ))}
    </ol>
  )
}

/** The team's datacards, to add from.
 *
 * Inline rather than a separate route, unlike the 40k catalog's: the pool is one
 * team's datacards — a dozen or so — where the 40k catalog is over a thousand units,
 * which is why that one is a page of its own. One default page covers any team.
 *
 * Every entry is addable, INCLUDING an `in_battle` one. That was verified rather
 * than assumed: `add_operative` refuses a cross-team datacard and a withdrawn one,
 * and nothing else — so `availability` only informs (#51), and refusing it here
 * would be the app holding a rule of the game, which #1 puts out of scope. The
 * marker is shown instead.
 *
 * A withdrawn datacard never appears, because the catalog read already filters it
 * (#55). A roster that already holds one keeps it. */
function AddOperative({ rosterId, killTeamId }: { rosterId: UUID; killTeamId: UUID }) {
  const operativesQuery = useKTOperatives({ kill_team_id: killTeamId })
  const add = useAddRosterOperative(rosterId)
  const options = operativesQuery.data?.items ?? []

  return (
    <section className={styles.add}>
      <h2 className={styles.addTitle}>Add an operative</h2>

      {operativesQuery.isPending ? (
        <p className={styles.quiet} role="status">
          Loading datacards…
        </p>
      ) : operativesQuery.isError ? (
        <p role="alert" className={styles.error}>
          {withReference("Couldn't load this team's datacards.", operativesQuery.error)}
        </p>
      ) : options.length === 0 ? (
        <p className={styles.quiet}>This team has no datacards in the catalog.</p>
      ) : (
        <ul className={styles.addRows}>
          {options.map((card) => (
            <li key={card.id} className={styles.addRow}>
              <span className={styles.addName}>
                {card.name}
                {card.availability === 'in_battle' && <Tag>In battle only</Tag>}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={add.isPending}
                // No "Added" state and nothing disabled once taken: adding the same
                // datacard twice APPENDS a second row rather than answering 409
                // (#50), the opposite of the 40k catalog's create-only POST.
                aria-label={`Add ${card.name}`}
                onClick={() => add.mutate(card.id)}
              >
                + Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Delete, with the consequence in the dialog's description.
 *
 * Refused once a game has been played from the roster (#60), with a 409 whose
 * message counts the games. That message is id-free and written for a person, so the
 * central toast shows it verbatim and nothing is worded here. */
function DeleteRoster({ roster }: { roster: KTRoster_Read }) {
  const navigate = useNavigate()
  const deleteRoster = useDeleteRoster()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <div className={styles.danger}>
        <Button variant="dangerOutline" size="sm" onClick={() => setConfirming(true)}>
          Delete Roster
        </Button>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this roster?"
        // The consequence as the dialog's DESCRIPTION rather than body copy, so
        // `aria-describedby` reaches it and it is read with the title.
        description={`${roster.name} and its ${pluralize(
          roster.operatives.length,
          'operative',
        )} will be removed. A roster a game was played from cannot be deleted.`}
      >
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteRoster.isPending}
            onClick={() =>
              deleteRoster.mutate(roster.id, {
                onSuccess: () => {
                  setConfirming(false)
                  navigate('/kill-team/rosters')
                },
                // On a refusal the dialog CLOSES and the toast carries the reason.
                // Leaving it open would sit a modal over the message explaining why
                // nothing happened.
                onError: () => setConfirming(false),
              })
            }
          >
            {deleteRoster.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </>
  )
}

/** What this kill team may field, beside the roster being built (KF7 group C).
 *
 * **Open by default**, which is the one place this disagrees with group B's collapsed
 * reference — and deliberately, because the content differs. Group B hides paragraphs a
 * player has finished reading; this is a short indented list they are reading WHILE
 * choosing, so it has to be there on arrival. Collapsible all the same, for the one team
 * that prints 101 rows.
 *
 * `KTRoster_Read` carries no `selection_rules`, so this needs the team detail — 16–46 KB,
 * a median of 24 over all 48 teams (#52). On the DEFAULT tab that means fetching whenever
 * a roster is opened, where a tab would have fetched only if someone looked. That is the
 * price of the thing being there when it is wanted, and it is paid at most once per
 * session per team: the read carries `staleTime: Infinity`, which #21 and #49 make a
 * statement of fact rather than a tuning choice — the Kill Team catalog has no write
 * route at all. */
function RosterComposition({ killTeamId }: { killTeamId: UUID }) {
  // Controlled rather than a bare `<details open>`: `open` is a DOM attribute React
  // re-applies on every render, so a roster write that re-renders this view would pop a
  // disclosure the player had closed back open.
  const [open, setOpen] = useState(true)
  const team = useKillTeam(killTeamId)

  return (
    <details
      className={styles.composition}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={styles.compositionSummary}>What this kill team may field</summary>
      {team.isPending ? (
        <p role="status" className={styles.quiet}>
          Loading the composition…
        </p>
      ) : team.isError ? (
        <p role="alert" className={styles.quiet}>
          Couldn’t load the composition.
        </p>
      ) : (
        <Composition rules={team.data?.selection_rules ?? []} />
      )}
    </details>
  )
}
