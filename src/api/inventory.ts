/* Inventory resource functions — the user's owned datasheets under
 * `/me/inventory/…`. See SPEC.md → "Routing & views" (InventoryView). */

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { AmountSet, Page, UnitAdd, UserUnit_Read, UUID } from './types'
import { parsed } from './parse'
import * as S from './schemas.gen'

/** `GET /me/inventory` — owned units with amounts (paged). */
export function listInventory(): Promise<Page<UserUnit_Read>> {
  return apiGet('/me/inventory').then((d) => parsed(S.Page_UserUnit_Read_, d, '/me/inventory'))
}

/** `POST /me/inventory` — record ownership of a unit (upsert; `amount` defaults
 * to 1 on the backend). */
export function addUnit(body: UnitAdd): Promise<UserUnit_Read> {
  return apiPost('/me/inventory', body).then((d) => parsed(S.UserUnit_Read, d, '/me/inventory'))
}

/** `PATCH /me/inventory/{unit_id}` — set the owned quantity. */
export function setAmount(unitId: UUID, amount: number): Promise<UserUnit_Read> {
  const body: AmountSet = { amount }
  return apiPatch(`/me/inventory/${unitId}`, body).then((d) =>
    parsed(S.UserUnit_Read, d, '/me/inventory/{id}'),
  )
}

/** `DELETE /me/inventory/{unit_id}` → `204`. */
export function removeUnit(unitId: UUID): Promise<void> {
  return apiDelete(`/me/inventory/${unitId}`)
}
