/* Create-roster overlay. See ROADMAP.md → KF3, and KILLTEAM.md #64.
 *
 * Mirrors `NewArmyModal`, with one difference worth naming: the kill team is chosen
 * through the `Select` primitive rather than a raw `<select>` plus `useId()` plus a
 * hand-written label. That copy is exactly the gap `Select` was built to close, and
 * this modal is where the second copy would have gone. */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAllKillTeams, useCreateRoster, useKTFactions } from '../api/killTeamQueries'
import type { UUID } from '../api/types'
import { messageForError } from '../lib/errors'
import { Button, Field, Modal, Select } from '../ui'
import styles from './NewRosterModal.module.css'

export interface NewRosterModalProps {
  open: boolean
  onClose: () => void
}

export function NewRosterModal({ open, onClose }: NewRosterModalProps) {
  const navigate = useNavigate()
  // Gated on `open`: the modal stays mounted while closed so it can restore focus,
  // so these would otherwise fetch on every render of the page behind it.
  const teamsQuery = useAllKillTeams(open)
  const factionsQuery = useKTFactions(open)
  const createRoster = useCreateRoster()

  const [name, setName] = useState('')
  const [killTeamId, setKillTeamId] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // A team row names its faction by id only (#46), and a list of 48 teams is far
  // easier to pick from when each one says whose it is — "Raveners — Tyranids".
  const teamOptions = useMemo(() => {
    const factionNames = new Map<UUID, string>()
    for (const faction of factionsQuery.data?.items ?? []) factionNames.set(faction.id, faction.name)
    const teams = teamsQuery.data?.items ?? []
    return [
      { value: '', label: 'Select a kill team…' },
      ...teams.map((team) => {
        const faction = factionNames.get(team.faction_id)
        return { value: team.id, label: faction ? `${team.name} — ${faction}` : team.name }
      }),
    ]
  }, [teamsQuery.data, factionsQuery.data])

  const reset = () => {
    setName('')
    setKillTeamId('')
    setDescription('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give your roster a name.')
      return
    }
    if (!killTeamId) {
      setError('Choose a kill team.')
      return
    }

    const trimmedDescription = description.trim()

    createRoster.mutate(
      {
        name: trimmed,
        kill_team_id: killTeamId,
        // Omitted rather than sent as empty: an absent description is null, and ''
        // would store a blank where the player wrote nothing.
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      },
      {
        onSuccess: (roster) => {
          reset()
          onClose()
          navigate(`/kill-team/rosters/${roster.id}`)
        },
        onError: (err) => {
          // Shown in the form rather than left to the central toast, because the
          // player is looking at the field that caused it. A duplicate name is the
          // likely case (#64) and the backend's message names it in words a person
          // can act on, so it is preferred over any copy written here.
          setError(messageForError(err, 'Could not create the roster.'))
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Roster">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Roster Name"
          placeholder="My Raveners"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Select
          label="Kill Team"
          options={teamOptions}
          value={killTeamId}
          onChange={(e) => setKillTeamId(e.target.value)}
          disabled={teamsQuery.isPending}
        />

        <Field
          label="Description"
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* The team cannot be changed later: every operative is held to it by a
          * composite foreign key, so switching would mean emptying the roster. Said
          * here, where it is still a choice. */}
        <p className={styles.note}>The kill team is fixed once the roster is created.</p>

        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createRoster.isPending}>
            {createRoster.isPending ? 'Creating…' : 'Create Roster'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
