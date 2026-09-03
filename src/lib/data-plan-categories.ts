/**
 * Shared data-plan categorisation.
 *
 * The VTU catalog (Smartspeed) classifies every data bundle with its own
 * `plan_type` field (returned to the API as `planType`). The bills page used
 * to build its category tabs by string-matching the plan NAME ("1gb", "night",
 * "30 day"), which drifted from the provider's classification and from the
 * admin pricing console (which already reads `planType`).
 *
 * These helpers group bundles by the REAL catalog `planType`, falling back to
 * a validity bucket only when a plan carries no usable type. This keeps the
 * customer-facing tabs, the VTU catalogue and the admin pricing console all in
 * sync.
 */

export interface DataPlanLike {
  name?: string
  validity?: string
  planType?: string
  plan_type?: string
}

export interface PlanCategory {
  /** Stable id used as the active-tab key. */
  id: string
  /** Human-friendly tab label. */
  label: string
  /** Number of plans in this category. */
  count: number
}

// Friendly labels for the plan_type values the Smartspeed catalog actually
// emits. Unknown types fall through to a readable form of the raw type.
const PLAN_TYPE_LABELS: Record<string, string> = {
  GIFTING: 'Gifting',
  DATAPLAN: 'Data',
  DATA: 'Data',
  SME: 'SME',
  SMEB: 'SME',
  SME_PLUS: 'SME',
  CORPERAT: 'Corporate',
  CORPORATE: 'Corporate',
  ALLINONE: 'All-in-One',
  ALL_IN_ONE: 'All-in-One',
  ALLIN_ONE: 'All-in-One',
  WEEKEND: 'Weekend',
  NIGHT: 'Night',
  NIGHT_PLAN: 'Night',
  BROADBAND: 'Broadband',
  ROUTER: 'Broadband',
  ROUTER_PLAN: 'Broadband',
}

// Validity buckets are only used when a plan has no usable plan_type.
function fallbackValidityBucket(plan: DataPlanLike): { id: string; label: string } {
  const v = (plan.validity || '').toLowerCase()
  const name = (plan.name || '').toLowerCase()
  if (v.includes('30 day') || v.includes('month') || v.includes('60 day') || v.includes('90 day') || name.includes('monthly')) {
    return { id: 'MONTHLY', label: 'Monthly' }
  }
  if (v.includes('7 day') || v.includes('14 day') || v.includes('week') || name.includes('weekly')) {
    return { id: 'WEEKLY', label: 'Weekly' }
  }
  if (v.includes('1 day') || v.includes('2 day') || v.includes('3 day') || name.includes('daily')) {
    return { id: 'DAILY', label: 'Daily' }
  }
  return { id: 'OTHER', label: 'Other' }
}

/** Stable category key for a plan (derived from the real catalog type). */
export function planCategoryId(plan: DataPlanLike): string {
  const t = (plan.planType || plan.plan_type || '').toString().toUpperCase().trim()
  if (t) return t
  return fallbackValidityBucket(plan).id
}

/** Human-friendly label for a category key. */
export function planCategoryLabel(id: string, plans?: DataPlanLike[]): string {
  if (id === 'ALL') return 'All'
  const label = PLAN_TYPE_LABELS[id]
  if (label) return label
  // If the key came from a validity fallback, prefer its friendly name.
  const sample = (plans || []).find((p) => planCategoryId(p) === id)
  if (sample && !(sample.planType || sample.plan_type)) {
    return fallbackValidityBucket(sample).label
  }
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Build the ordered list of category tabs for a set of plans. 'ALL' is always
 * last. Categories are ordered by count (most plans first) so the default tab
 * is the most useful one.
 */
export function buildPlanCategories(plans: DataPlanLike[] | undefined | null): PlanCategory[] {
  if (!plans || !Array.isArray(plans) || plans.length === 0) return []

  const order: string[] = []
  const counts = new Map<string, number>()

  for (const plan of plans) {
    const id = planCategoryId(plan)
    counts.set(id, (counts.get(id) || 0) + 1)
    if (!order.includes(id)) order.push(id)
  }

  // Sort by size descending; keep 'ALL' last.
  order.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))

  const categories = order.map((id) => ({
    id,
    label: planCategoryLabel(id, plans),
    count: counts.get(id) || 0,
  }))
  categories.push({ id: 'ALL', label: 'All', count: plans.length })
  return categories
}

/** Whether a plan belongs to the given category id. */
export function planMatchesCategory(plan: DataPlanLike, id: string): boolean {
  if (id === 'ALL') return true
  return planCategoryId(plan) === id
}
