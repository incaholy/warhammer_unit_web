/* Inventory resource functions — the user's owned datasheets under
 * `/me/inventory/…`. See SPEC.md → "Routing & views" (InventoryView). */

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { AmountSet, UnitAdd, UserUnit_Read, UUID } from './types'

/** `GET /me/inventory` — owned units with amounts. */
export function listInventory(): Promise<UserUnit_Read[]> {
  return apiGet<UserUnit_Read[]>('/me/inventory')
}

/** `POST /me/inventory` — record ownership of a unit (upsert; `amount` defaults
 * to 1 on the backend). */
export function addUnit(body: UnitAdd): Promise<UserUnit_Read> {
  return apiPost<UserUnit_Read>('/me/inventory', body)
}

/** `PATCH /me/inventory/{unit_id}` — set the owned quantity. */
export function setAmount(unitId: UUID, amount: number): Promise<UserUnit_Read> {
  const body: AmountSet = { amount }
  return apiPatch<UserUnit_Read>(`/me/inventory/${unitId}`, body)
}

/** `DELETE /me/inventory/{unit_id}` → `204`. */
export function removeUnit(unitId: UUID): Promise<void> {
  return apiDelete(`/me/inventory/${unitId}`)
}
