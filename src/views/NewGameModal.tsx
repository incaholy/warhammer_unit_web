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
import { Link } from 'react-router-dom'

import { useCreateGame } from '../api/killTeamGamesQueries'
import { useRosters } from '../api/killTeamQueries'
import { messageForError } from '../lib/errors'
import { Button, Field, Modal, Select } from '../ui'
import styles from './NewGameModal.module.css'

export interface NewGameModalProps {
  open: boolean
  onClose: () => void
}

export function NewGameModal({ open, onClose }: NewGameModalProps) {
  const rostersQuery = useRosters()
  const createGame = useCreateGame()

  const [rosterId, setRosterId] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rosters = rostersQuery.data?.items ?? []

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

    const trimmed = opponentName.trim()

    createGame.mutate(
      {
        roster_id: rosterId,
        // Omitted rather than sent as '': the field is nullable with a minimum length
        // of 1, so an empty string is a 422 while an absent key is "no opponent named".
        ...(trimmed ? { opponent_name: trimmed } : {}),
      },
      {
        // Closes onto the refreshed list rather than navigating to the new battle,
        // which is the one place this departs from `NewRosterModal`. The battle
        // screen is KF4c; navigating there now would land on no route and bounce the
        // player to `/`. `useCreateGame` invalidates the list, so the new battle is
        // the top row and one tap away, and KF4c adds the navigation with the screen
        // it goes to.
        onSuccess: () => {
          reset()
          onClose()
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

          <Field
            label="Opponent"
            placeholder="Optional"
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value)}
          />

          {/* Everything the battle needs is copied when it starts (#22, #24), so
            * later edits to the roster do not reach a game already under way — and a
            * roster a game was played from cannot be deleted (#60). */}
          <p className={styles.note}>
            The roster is copied into the battle. Changing it later will not affect this
            game.
          </p>

          {error && (
            <span role="alert" className={styles.error}>
              {error}
            </span>
          )}

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createGame.isPending}>
              {createGame.isPending ? 'Starting…' : 'Start Battle'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
