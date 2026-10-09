/* SectionView (`/`) — the chooser between the app's two sections. See SPEC.md →
 * "Routing & views", and KILLTEAM.md decision #11.
 *
 * `/` is a chooser rather than either section's index so that neither is the app's
 * implicit default. It used to render the armies index, which made the 40k builder
 * the whole app; Kill Team is a peer, not an addition to it.
 *
 * The Kill Team card is deliberately shown and deliberately not a link: the section
 * arrives in KF2. An absent card would hide the half of the app that is coming, and
 * a live link would land on the catch-all and bounce silently back here — which
 * reads as a broken click rather than as "not yet". */

import { Link } from 'react-router-dom'

import { Eyebrow } from '../ui'
import styles from './SectionView.module.css'

export default function SectionView() {
  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <Eyebrow>Muster</Eyebrow>
        <h1 className={styles.title}>Two games, one shelf</h1>
        <p className={styles.lede}>
          Build and track a Warhammer 40,000 army, or run a Kill Team battle at the table.
        </p>
      </div>

      <ul className={styles.sections}>
        <li>
          <Link to="/army-list" className={styles.card}>
            <span className={styles.cardEyebrow}>Warhammer 40,000</span>
            <span className={styles.cardTitle}>Army List</span>
            <span className={styles.cardBody}>
              Your armies and the datasheets you own, checked against a points limit.
            </span>
          </Link>
        </li>
        <li>
          <Link to="/kill-team" className={styles.card}>
            <span className={styles.cardEyebrow}>Kill Team 2024</span>
            <span className={styles.cardTitle}>Kill Team</span>
            <span className={styles.cardBody}>
              Browse the kill teams, build a roster, and track a battle turn by turn.
            </span>
            <span className={styles.cardNote}>Catalog ready · no account needed</span>
          </Link>
        </li>
      </ul>
    </main>
  )
}
