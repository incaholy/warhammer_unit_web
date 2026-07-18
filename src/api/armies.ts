/* Army resource functions — CRUD plus unit membership, shortfall, and validation,
 * all under `/me/armies/…`. See SPEC.md → "Routing & views" (ArmyView) and
 * "Roadmap" (validate / shortfall). */

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  AmountSet,
  Army_Create,
  Army_Read,
  Army_Update,
  ArmyUnit_Read,
  Shortfall_Read,
  UnitAdd,
  UUID,
  Validation_Read,
} from './types'

/** `GET /me/armies` — the user's armies. */
export function listArmies(): Promise<Army_Read[]> {
  return apiGet<Army_Read[]>('/me/armies')
}

/** `GET /me/armies/{id}`. */
export function getArmy(id: UUID): Promise<Army_Read> {
  return apiGet<Army_Read>(`/me/armies/${id}`)
}

/** `POST /me/armies` → `201 Army_Read`. */
export function createArmy(body: Army_Create): Promise<Army_Read> {
  return apiPost<Army_Read>('/me/armies', body)
}

/** `PATCH /me/armies/{id}`. */
export function updateArmy(id: UUID, body: Army_Update): Promise<Army_Read> {
  return apiPatch<Army_Read>(`/me/armies/${id}`, body)
}

/** `DELETE /me/armies/{id}` → `204`. */
export function deleteArmy(id: UUID): Promise<void> {
  return apiDelete(`/me/armies/${id}`)
}

/** `POST /me/armies/{id}/units` — add a unit to the list (upsert; `amount`
 * defaults to 1 on the backend). */
export function addUnit(armyId: UUID, body: UnitAdd): Promise<ArmyUnit_Read> {
  return apiPost<ArmyUnit_Read>(`/me/armies/${armyId}/units`, body)
}

/** `PATCH /me/armies/{id}/units/{unit_id}` — set the fielded quantity. */
export function setAmount(armyId: UUID, unitId: UUID, amount: number): Promise<ArmyUnit_Read> {
  const body: AmountSet = { amount }
  return apiPatch<ArmyUnit_Read>(`/me/armies/${armyId}/units/${unitId}`, body)
}

/** `DELETE /me/armies/{id}/units/{unit_id}` → `204`. */
export function removeUnit(armyId: UUID, unitId: UUID): Promise<void> {
  return apiDelete(`/me/armies/${armyId}/units/${unitId}`)
}

/** `GET /me/armies/{id}/shortfall` — what to buy: list vs owned per unit. */
export function shortfall(id: UUID): Promise<Shortfall_Read[]> {
  return apiGet<Shortfall_Read[]>(`/me/armies/${id}/shortfall`)
}

/** `GET /me/armies/{id}/validate` — points / faction legality. */
export function validate(id: UUID): Promise<Validation_Read> {
  return apiGet<Validation_Read>(`/me/armies/${id}/validate`)
}
