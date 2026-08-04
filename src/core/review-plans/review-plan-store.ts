export interface ExpiringReviewPlan {
  expiresAt: string;
}

export type ConsumedReviewPlan<TPlan> =
  | { status: "ready"; plan: TPlan }
  | { status: "missing" }
  | { status: "expired" };

/**
 * In-memory capability store for destructive or mutating review flows.
 * Plans are bounded, expire automatically, and are consumed exactly once.
 */
export class ReviewPlanStore<TPlan extends ExpiringReviewPlan> {
  private readonly plans = new Map<string, TPlan>();

  constructor(private readonly maximumPlans = 200) {}

  put(id: string, plan: TPlan, now = new Date()): void {
    this.prune(now);
    while (this.plans.size >= this.maximumPlans) {
      const oldest = this.plans.keys().next().value as string | undefined;
      if (!oldest) break;
      this.plans.delete(oldest);
    }
    this.plans.set(id, plan);
  }

  consume(id: string, now = new Date()): ConsumedReviewPlan<TPlan> {
    const plan = this.plans.get(id);
    if (!plan) return { status: "missing" };
    this.plans.delete(id);
    if (Date.parse(plan.expiresAt) < now.getTime()) return { status: "expired" };
    return { status: "ready", plan };
  }

  prune(now = new Date()): void {
    for (const [id, plan] of this.plans) {
      if (Date.parse(plan.expiresAt) < now.getTime()) this.plans.delete(id);
    }
  }

  clear(): void {
    this.plans.clear();
  }

  get size(): number {
    return this.plans.size;
  }
}

const globalReviewPlanStores = globalThis as typeof globalThis & {
  __skillAtlasReviewPlanStores?: Map<string, ReviewPlanStore<ExpiringReviewPlan>>;
};

const reviewPlanStores = globalReviewPlanStores.__skillAtlasReviewPlanStores
  || new Map<string, ReviewPlanStore<ExpiringReviewPlan>>();
globalReviewPlanStores.__skillAtlasReviewPlanStores = reviewPlanStores;

export function getReviewPlanStore<TPlan extends ExpiringReviewPlan>(
  namespace: string,
  options: { maximumPlans?: number } = {},
): ReviewPlanStore<TPlan> {
  const existing = reviewPlanStores.get(namespace);
  if (existing) return existing as ReviewPlanStore<TPlan>;
  const created = new ReviewPlanStore<TPlan>(options.maximumPlans ?? 200);
  reviewPlanStores.set(namespace, created as ReviewPlanStore<ExpiringReviewPlan>);
  return created;
}
