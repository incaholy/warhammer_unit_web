/* Start-a-battle overlay. See ROADMAP.md → KF4, and KILLTEAM.md #60, #69.
 *
 * Mirrors `NewRosterModal`, with two differences that are not cosmetic.
 *
 * A game is started FROM a roster — `roster_id` is the only required field, and the
 * kill team, the operatives, the rules, the ploys and the equipment text are all
 * copied from it (#22, #24). So the picker lists rosters, not kill teams, and a
 * player with no rosters cannot start a battle at all. That is a state this modal has
 * to render rather than present as an empty dropdown, because an empty `Select` with
 * a disabled button says nothing about what to do next.
 *
 * `opponent_name` is optional. It is a label on the game, not an account: the common
 * case is an opponent with no account whose details are filled in by hand, which is
 * also why two SIDES land before two USERS on the backend (K8 before K9). */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useCreateGame } from '../api/killTeamGamesQueries'
import { useRoster, useRosters } from '../api/killTeamQueries'
import { messageForError } from '../lib/errors'
import { Button, Field, Modal, Select } from '../ui'
import styles from './NewGameModal.module.css'

export interface NewGameModalProps {
  open: boolean
  onClose: () => void
}

export function NewGameModal({ open, onClose }: NewGameModalProps) {
  const navigate = useNavigate()
  const rostersQuery = useRosters()
  const createGame = useCreateGame()

  const [rosterId, setRosterId] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rosters = rostersQuery.data?.items ?? []

  // Whether the chosen roster has anyone in it. `KTRoster_ListRead` does NOT carry an
  // operative count -- only the detail read has `operatives` -- so this is a second
  // request, and it is why the check lives on SELECTION rather than on open: `useRoster`
  // is already `enabled: Boolean(rosterId)`, so nothing is fetched until a roster is
  // picked, and nothing at all if the player cancels.
  //
  // A battle used to be startable from an empty roster: verified end to end, advanced
  // through four turning points and finished, reading "No operatives in this battle"
  // (ROADMAP F13). This app otherwise informs and never refuses (#1, #51, #57), so
  // BLOCKING here is a deliberate exception rather than the house style: a roster with
  // nobody in it produces a battle with nothing to track, and the modal already promises
  // that "the roster is copied into the battle".
  const chosen = useRoster(rosterId)
  const checkingRoster = Boolean(rosterId) && chosen.isPending
  const chosenIsEmpty = chosen.isSuccess && chosen.data.operatives.length === 0

  // The roster row already carries `kill_team_name`, so the label says which team the
  // battle will be played with -- the thing that cannot be changed afterwards.
  const rosterOptions = useMemo(
    () => [
      { value: '', label: 'Select a roster…' },
      ...rosters.map((roster) => ({
        value: roster.id,
        label: `${roster.name} — ${roster.kill_team_name}`,
      })),
    ],
    [rosters],
  )

  const reset = () => {
    setRosterId('')
    setOpponentName('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!rosterId) {
      setError('Choose a roster.')
      return
    }

    // The button is disabled in both cases; this is the second lock, for a submit that
    // arrives by Enter before the check has landed.
    if (checkingRoster || chosenIsEmpty) return

    const trimmed = opponentName.trim()

    createGame.mutate(
      {
        roster_id: rosterId,
        // Omitted rather than sent as '': the field is nullable with a minimum length
        // of 1, so an empty string is a 422 while an absent key is "no opponent named".
        ...(trimmed ? { opponent_name: trimmed } : {}),
      },
      {
        // Straight into the battle, now that KF4c gives it a screen. KF4b closed onto
        // the refreshed list instead, because navigating to a route that did not exist
        // would have bounced the player to `/`.
        onSuccess: (game) => {
          reset()
          onClose()
          navigate(`/kill-team/games/${game.id}`)
        },
        onError: (err) => {
          // In the form rather than left to the central toast, because the player is
          // looking at the picker that caused it. A roster that is not theirs answers
          // 404, and a deleted roster is the reachable case: the picker was filled
          // from a list that may be a few minutes old.
          setError(messageForError(err, 'Could not start the battle.'))
        },
      },
    )
  }

  const noRosters = rostersQuery.isSuccess && rosters.length === 0

  return (
    <Modal open={open} onClose={handleClose} title="New Battle">
      {noRosters ? (
        <div className={styles.form}>
          <p className={styles.blocked}>
            A battle is started from a roster, so you need one first.
          </p>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Link to="/kill-team/rosters" className={styles.link} onClick={handleClose}>
              Go to rosters
            </Link>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <Select
            label="Roster"
            options={rosterOptions}
            value={rosterId}
            onChange={(e) => setRosterId(e.target.value)}
            disabled={rostersQuery.isPending}
          />

          {/* "Opponent" alone read as naming a person who would JOIN, which a tester
            * reasonably expected and which does not exist: this is a label on the
            * battle, `opponent_name` is a nullable string, and no invite or join
            * operation is published on either side yet. A free-text field costs nothing
            * to build and promises a feature two backend slices away, so the label says
            * what it is. Reworded when K9 makes it a side with an occupant (#67, #74). */}
          <Field
            label="Opponent's name"
            placeholder="Optional — a label for this battle"
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value)}
          />

          {/* Everything the battle needs is copied when it starts (#22, #24), so
            * later edits to the roster do not reach a game already under way — and a
            * roster a game was played from cannot be deleted (#60). */}
          <p className={styles.note}>
            The roster is copied into the battle. Changing it later will not affect this
            game. Naming an opponent does not invite them — you track both sides yourself
            for now.
          </p>

          {chosenIsEmpty && (
            <p role="alert" className={styles.blocked}>
              {chosen.data.name} has no operatives yet, so there would be nothing to
              track. Add some to the roster first.
            </p>
          )}

          {error && (
            <span role="alert" className={styles.error}>
              {error}
            </span>
          )}

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createGame.isPending || checkingRoster || chosenIsEmpty}
            >
              {createGame.isPending ? 'Starting…' : 'Start Battle'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
