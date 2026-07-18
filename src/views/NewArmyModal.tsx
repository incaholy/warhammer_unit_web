import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, Modal } from '../ui'
import { useCreateArmy, useFactions } from '../api/queries'
import styles from './NewArmyModal.module.css'

export interface NewArmyModalProps {
  open: boolean
  onClose: () => void
}

/** Create-army overlay (SPEC.md → "New Army modal"): an Army Name field and a
 *  Faction select. On success, navigates to the new army's page. */
export function NewArmyModal({ open, onClose }: NewArmyModalProps) {
  const navigate = useNavigate()
  const factionsQuery = useFactions()
  const createArmy = useCreateArmy()

  const factionSelectId = useId()
  const [name, setName] = useState('')
  const [factionId, setFactionId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const factions = factionsQuery.data ?? []

  const reset = () => {
    setName('')
    setFactionId('')
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
      setError('Give your army a name.')
      return
    }
    if (!factionId) {
      setError('Choose a faction.')
      return
    }

    createArmy.mutate(
      { name: trimmed, faction_id: factionId },
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
            onChange={(e) => setFactionId(e.target.value)}
          >
            <option value="">Select a faction…</option>
            {factions.map((faction) => (
              <option key={faction.id} value={faction.id}>
                {faction.name}
              </option>
            ))}
          </select>
        </div>

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
