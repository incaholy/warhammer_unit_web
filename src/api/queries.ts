/* TanStack Query integration — one query key per resource plus the hooks that wrap
 * the resource functions, and mutation hooks that invalidate the affected keys.
 * See SPEC.md → "State management". */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import * as armiesApi from './armies'
import * as factionsApi from './factions'
import * as inventoryApi from './inventory'
import * as unitsApi from './units'
import { getMe } from './auth'
import type { ListUnitsParams, ListUnitsResult } from './units'
import type {
  Army_Create,
  Army_Read,
  Army_Update,
  ArmyUnit_Read,
  Faction_Read,
  Shortfall_Read,
  Unit_Read,
  UnitAdd,
  User_Read,
  UserUnit_Read,
  UUID,
  Validation_Read,
} from './types'

// ---- Query keys ----
// Stable, hierarchical keys so mutations can invalidate exactly what they touch.

export const queryKeys = {
  me: ['me'] as const,
  armies: ['armies'] as const,
  army: (id: UUID) => ['army', id] as const,
  armyShortfall: (id: UUID) => ['army', id, 'shortfall'] as const,
  armyValidation: (id: UUID) => ['army', id, 'validate'] as const,
  units: (filters: ListUnitsParams = {}) => ['units', filters] as const,
  unit: (id: UUID) => ['unit', id] as const,
  factions: ['factions'] as const,
  factionTaxonomy: ['factions', 'taxonomy'] as const,
  inventory: ['inventory'] as const,
}

// ---- Read hooks ----

export function useMe(enabled = true): UseQueryResult<User_Read> {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe, enabled })
}

export function useArmies(): UseQueryResult<Army_Read[]> {
  return useQuery({ queryKey: queryKeys.armies, queryFn: armiesApi.listArmies })
}

export function useArmy(id: UUID): UseQueryResult<Army_Read> {
  return useQuery({
    queryKey: queryKeys.army(id),
    queryFn: () => armiesApi.getArmy(id),
    enabled: Boolean(id),
  })
}

export function useArmyShortfall(id: UUID): UseQueryResult<Shortfall_Read[]> {
  return useQuery({
    queryKey: queryKeys.armyShortfall(id),
    queryFn: () => armiesApi.shortfall(id),
    enabled: Boolean(id),
  })
}

export function useArmyValidation(id: UUID): UseQueryResult<Validation_Read> {
  return useQuery({
    queryKey: queryKeys.armyValidation(id),
    queryFn: () => armiesApi.validate(id),
    enabled: Boolean(id),
  })
}

export function useUnits(filters: ListUnitsParams = {}): UseQueryResult<ListUnitsResult> {
  return useQuery({
    queryKey: queryKeys.units(filters),
    queryFn: () => unitsApi.listUnits(filters),
  })
}

export function useUnit(id: UUID): UseQueryResult<Unit_Read> {
  return useQuery({
    queryKey: queryKeys.unit(id),
    queryFn: () => unitsApi.getUnit(id),
    enabled: Boolean(id),
  })
}

export function useFactions(): UseQueryResult<Faction_Read[]> {
  return useQuery({ queryKey: queryKeys.factions, queryFn: factionsApi.listFactions })
}

export function useInventory(): UseQueryResult<UserUnit_Read[]> {
  return useQuery({ queryKey: queryKeys.inventory, queryFn: inventoryApi.listInventory })
}

// ---- Army mutation hooks ----

export function useCreateArmy(): UseMutationResult<Army_Read, Error, Army_Create> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Army_Create) => armiesApi.createArmy(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.armies })
    },
    meta: { successMessage: 'Army created' },
  })
}

export function useUpdateArmy(
  id: UUID,
): UseMutationResult<Army_Read, Error, Army_Update> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Army_Update) => armiesApi.updateArmy(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.army(id) })
      qc.invalidateQueries({ queryKey: queryKeys.armies })
    },
  })
}

export function useDeleteArmy(): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => armiesApi.deleteArmy(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.army(id) })
      qc.invalidateQueries({ queryKey: queryKeys.armies })
    },
    meta: { successMessage: 'Army deleted' },
  })
}

/** Invalidate everything derived from an army's unit list. */
function invalidateArmyMembership(
  qc: ReturnType<typeof useQueryClient>,
  armyId: UUID,
): void {
  qc.invalidateQueries({ queryKey: queryKeys.army(armyId) })
  qc.invalidateQueries({ queryKey: queryKeys.armies })
  qc.invalidateQueries({ queryKey: queryKeys.armyShortfall(armyId) })
  qc.invalidateQueries({ queryKey: queryKeys.armyValidation(armyId) })
}

export function useAddArmyUnit(
  armyId: UUID,
): UseMutationResult<ArmyUnit_Read, Error, UnitAdd> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UnitAdd) => armiesApi.addUnit(armyId, body),
    onSuccess: () => invalidateArmyMembership(qc, armyId),
    meta: { successMessage: 'Unit added to army' },
  })
}

export function useSetArmyUnitAmount(
  armyId: UUID,
): UseMutationResult<ArmyUnit_Read, Error, { unitId: UUID; amount: number }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitId, amount }: { unitId: UUID; amount: number }) =>
      armiesApi.setAmount(armyId, unitId, amount),
    onSuccess: () => invalidateArmyMembership(qc, armyId),
  })
}

export function useRemoveArmyUnit(
  armyId: UUID,
): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (unitId: UUID) => armiesApi.removeUnit(armyId, unitId),
    onSuccess: () => invalidateArmyMembership(qc, armyId),
    meta: { successMessage: 'Unit removed from army' },
  })
}

// ---- Inventory mutation hooks ----

/** Adding to inventory also affects any army's shortfall (owned counts change), so
 * invalidate every army-scoped query too. */
function invalidateInventory(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: queryKeys.inventory })
  qc.invalidateQueries({ queryKey: ['army'] })
}

export function useAddInventoryUnit(): UseMutationResult<UserUnit_Read, Error, UnitAdd> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UnitAdd) => inventoryApi.addUnit(body),
    onSuccess: () => invalidateInventory(qc),
    meta: { successMessage: 'Added to inventory' },
  })
}

export function useSetInventoryAmount(): UseMutationResult<
  UserUnit_Read,
  Error,
  { unitId: UUID; amount: number }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitId, amount }: { unitId: UUID; amount: number }) =>
      inventoryApi.setAmount(unitId, amount),
    onSuccess: () => invalidateInventory(qc),
  })
}

export function useRemoveInventoryUnit(): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (unitId: UUID) => inventoryApi.removeUnit(unitId),
    onSuccess: () => invalidateInventory(qc),
    meta: { successMessage: 'Removed from inventory' },
  })
}
