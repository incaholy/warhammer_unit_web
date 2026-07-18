import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, Modal } from '../ui'
import { useCreateArmy, useFactions } from '../api/queries'
import styles from './NewArmyModal.module.css'

export interface NewArmyModalProps {
  open: boolean
  onClose: () => void
}

/** Create-army overlay (SPEC.md → "New Army modal"): Army Name and Faction, plus
 *  the optional Subfaction / Description / Points-limit fields (roadmap step 11).
 *  On success, navigates to the new army's page. */
export function NewArmyModal({ open, onClose }: NewArmyModalProps) {
  const navigate = useNavigate()
  const factionsQuery = useFactions()
  const createArmy = useCreateArmy()

  const factionSelectId = useId()
  const subfactionSelectId = useId()
  const [name, setName] = useState('')
  const [factionId, setFactionId] = useState('')
  const [subfactionId, setSubfactionId] = useState('')
  const [description, setDescription] = useState('')
  const [pointsLimit, setPointsLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  const factions = factionsQuery.data ?? []

  // Subfaction options come from the selected faction's own `subfactions` array
  // ({id, name}). We deliberately do NOT use GET /factions/taxonomy here: that
  // endpoint returns subfaction *names* only (no ids) for admin dropdowns, but
  // creating an army needs a real subfaction_id (UUID).
  const selectedFaction = factions.find((f) => f.id === factionId)
  const subfactions = selectedFaction?.subfactions ?? []

  const reset = () => {
    setName('')
    setFactionId('')
    setSubfactionId('')
    setDescription('')
    setPointsLimit('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFactionChange = (id: string) => {
    setFactionId(id)
    // The chosen subfaction belongs to the previous faction; drop it.
    setSubfactionId('')
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give your army a name.')
      return
    }
    if (!factionId) {
      setError('Choose a faction.')
      return
    }

    let pointsLimitValue: number | undefined
    if (pointsLimit.trim()) {
      const parsed = Number(pointsLimit)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Points limit must be zero or more.')
        return
      }
      pointsLimitValue = parsed
    }

    const trimmedDescription = description.trim()

    createArmy.mutate(
      {
        name: trimmed,
        faction_id: factionId,
        ...(subfactionId ? { subfaction_id: subfactionId } : {}),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(pointsLimitValue !== undefined ? { points_limit: pointsLimitValue } : {}),
      },
      {
        onSuccess: (army) => {
          reset()
          onClose()
          navigate(`/armies/${army.id}`)
        },
        onError: (err) => {
          setError(err.message || 'Could not create the army.')
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Army">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Army Name"
          placeholder="The Hollow Vigil"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <div className={styles.field}>
          <label htmlFor={factionSelectId} className={styles.label}>
            Faction
          </label>
          <select
            id={factionSelectId}
            className={styles.select}
            value={factionId}
            onChange={(e) => handleFactionChange(e.target.value)}
          >
            <option value="">Select a faction…</option>
            {factions.map((faction) => (
              <option key={faction.id} value={faction.id}>
                {faction.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={subfactionSelectId} className={styles.label}>
            Subfaction
          </label>
          <select
            id={subfactionSelectId}
            className={styles.select}
            value={subfactionId}
            onChange={(e) => setSubfactionId(e.target.value)}
            disabled={subfactions.length === 0}
          >
            <option value="">Any / none</option>
            {subfactions.map((subfaction) => (
              <option key={subfaction.id} value={subfaction.id}>
                {subfaction.name}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Description"
          placeholder="A grim host sworn to the long vigil."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <Field
          label="Points Limit"
          type="number"
          min={0}
          placeholder="2000"
          value={pointsLimit}
          onChange={(e) => setPointsLimit(e.target.value)}
        />

        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createArmy.isPending}>
            {createArmy.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default NewArmyModal
