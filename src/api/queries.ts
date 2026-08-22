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
import type { ListUnitsParams } from './units'
import type {
  Army_Create,
  Army_Read,
  ArmyUnit_Read,
  Faction_Read,
  Page,
  Shortfall_Read,
  Unit_Read,
  UnitAdd,
  UnitFacets,
  UserUnit_Read,
  UUID,
  Validation_Read,
} from './types'

// ---- Query keys ----
// One rule: `[resource, kind, ...]`. Every key for a resource extends that
// resource's root segment, so `invalidateQueries` can rely on TanStack Query's
// prefix matching instead of each call site enumerating what it touched.
//
// The `'list'` / `'detail'` segment is what makes this work in both directions:
// with `armies: ['armies']` and `army(id): ['army', id]` -- the previous shape --
// they were *siblings*, so invalidating one never matched the other and every
// mutation had to name both by hand (and the three army mutations disagreed about
// which). Rooting them fixes that; the explicit `kind` keeps the list from being a
// *prefix* of the details, so invalidating the list alone needs no `exact: true`.
//
// Read them as a tree:
//   ['armies']                              <- allArmies, matches everything below
//   ['armies', 'list']                      <- the list
//   ['armies', 'detail', id]                <- one army
//   ['armies', 'detail', id, 'shortfall']   <- derived from that army
export const queryKeys = {
  /** Prefix matching every armies query — the list, every detail, and their children. */
  allArmies: ['armies'] as const,
  armies: ['armies', 'list'] as const,
  army: (id: UUID) => ['armies', 'detail', id] as const,
  armyShortfall: (id: UUID) => ['armies', 'detail', id, 'shortfall'] as const,
  armyValidation: (id: UUID) => ['armies', 'detail', id, 'validate'] as const,
  units: (filters: ListUnitsParams = {}) => ['units', 'list', filters] as const,
  unitFacets: (filters: { q?: string; subfaction_id?: UUID } = {}) =>
    ['units', 'facets', filters] as const,
  unit: (id: UUID) => ['units', 'detail', id] as const,
  factions: ['factions', 'list'] as const,
  factionTaxonomy: ['factions', 'taxonomy'] as const,
  inventory: ['inventory', 'list'] as const,
}

// ---- Read hooks ----

export function useArmies(): UseQueryResult<Page<Army_Read>> {
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

export function useUnits(filters: ListUnitsParams = {}): UseQueryResult<Page<Unit_Read>> {
  return useQuery({
    queryKey: queryKeys.units(filters),
    queryFn: () => unitsApi.listUnits(filters),
  })
}

export function useUnitFacets(
  filters: { q?: string; subfaction_id?: UUID } = {},
): UseQueryResult<UnitFacets> {
  return useQuery({
    queryKey: queryKeys.unitFacets(filters),
    queryFn: () => unitsApi.unitFacets(filters),
  })
}

export function useUnit(id: UUID): UseQueryResult<Unit_Read> {
  return useQuery({
    queryKey: queryKeys.unit(id),
    queryFn: () => unitsApi.getUnit(id),
    enabled: Boolean(id),
  })
}

export function useFactions(): UseQueryResult<Page<Faction_Read>> {
  return useQuery({ queryKey: queryKeys.factions, queryFn: factionsApi.listFactions })
}

export function useInventory(): UseQueryResult<Page<UserUnit_Read>> {
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

/** Invalidate everything derived from an army's unit list.
 *
 * Two prefixes, not four keys: `army(id)` is the root of that army's detail,
 * shortfall and validation, so one call covers all three and a fourth derived
 * query added tomorrow is covered without editing this. */
function invalidateArmyMembership(
  qc: ReturnType<typeof useQueryClient>,
  armyId: UUID,
): void {
  qc.invalidateQueries({ queryKey: queryKeys.army(armyId) })
  qc.invalidateQueries({ queryKey: queryKeys.armies })
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
  // An army's shortfall is computed against the inventory, so changing what the
  // user owns invalidates every armies query, not just one army's.
  qc.invalidateQueries({ queryKey: queryKeys.allArmies })
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
