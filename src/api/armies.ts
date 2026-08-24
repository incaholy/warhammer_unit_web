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
  Page,
  Shortfall_Read,
  UnitAdd,
  UUID,
  Validation_Read,
} from './types'
import { z } from 'zod'
import { parsed } from './parse'
import * as S from './schemas.gen'

/** `GET /me/armies` — the user's armies (paged). */
export function listArmies(): Promise<Page<Army_Read>> {
  return apiGet('/me/armies').then((d) => parsed(S.Page_Army_Read_, d, '/me/armies'))
}

/** `GET /me/armies/{id}`. */
export function getArmy(id: UUID): Promise<Army_Read> {
  return apiGet(`/me/armies/${id}`).then((d) => parsed(S.Army_Read, d, '/me/armies/{id}'))
}

/** `POST /me/armies` → `201 Army_Read`. */
export function createArmy(body: Army_Create): Promise<Army_Read> {
  return apiPost('/me/armies', body).then((d) => parsed(S.Army_Read, d, '/me/armies'))
}

/** `PATCH /me/armies/{id}`. */
export function updateArmy(id: UUID, body: Army_Update): Promise<Army_Read> {
  return apiPatch(`/me/armies/${id}`, body).then((d) => parsed(S.Army_Read, d, '/me/armies/{id}'))
}

/** `DELETE /me/armies/{id}` → `204`. */
export function deleteArmy(id: UUID): Promise<void> {
  return apiDelete(`/me/armies/${id}`)
}

/** `POST /me/armies/{id}/units` — add a unit to the list (upsert; `amount`
 * defaults to 1 on the backend). */
export function addUnit(armyId: UUID, body: UnitAdd): Promise<ArmyUnit_Read> {
  return apiPost(`/me/armies/${armyId}/units`, body).then((d) =>
    parsed(S.ArmyUnit_Read, d, '/me/armies/{id}/units'),
  )
}

/** `PATCH /me/armies/{id}/units/{unit_id}` — set the fielded quantity. */
export function setAmount(armyId: UUID, unitId: UUID, amount: number): Promise<ArmyUnit_Read> {
  const body: AmountSet = { amount }
  return apiPatch(`/me/armies/${armyId}/units/${unitId}`, body).then((d) =>
    parsed(S.ArmyUnit_Read, d, '/me/armies/{id}/units/{unitId}'),
  )
}

/** `DELETE /me/armies/{id}/units/{unit_id}` → `204`. */
export function removeUnit(armyId: UUID, unitId: UUID): Promise<void> {
  return apiDelete(`/me/armies/${armyId}/units/${unitId}`)
}

/** `GET /me/armies/{id}/shortfall` — what to buy: list vs owned per unit. */
export function shortfall(id: UUID): Promise<Shortfall_Read[]> {
  return apiGet(`/me/armies/${id}/shortfall`).then((d) =>
    parsed(z.array(S.Shortfall_Read), d, '/me/armies/{id}/shortfall'),
  )
}

/** `GET /me/armies/{id}/validate` — points / faction legality. */
export function validate(id: UUID): Promise<Validation_Read> {
  return apiGet(`/me/armies/${id}/validate`).then((d) =>
    parsed(S.Validation_Read, d, '/me/armies/{id}/validate'),
  )
}
