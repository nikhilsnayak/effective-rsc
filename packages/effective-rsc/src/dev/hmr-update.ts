export type PendingDevUpdate = {
  readonly acknowledgedClientHash: string;
  readonly clientHash: string;
  readonly rscRefresh: 'Current' | 'Pending';
};

export type HotUpdateCheck =
  | { readonly _tag: 'Failed' }
  | {
      readonly _tag: 'Completed';
      readonly currentHash: string;
      readonly previousHash: string;
      readonly updatedModules: ReadonlyArray<string | number> | null;
    };

export type HotUpdateDecision =
  | { readonly _tag: 'Reload' }
  | { readonly _tag: 'Retry'; readonly acknowledgedClientHash: string };

export const decideHotUpdate = (
  pending: PendingDevUpdate,
  check: HotUpdateCheck,
): HotUpdateDecision => {
  if (check._tag === 'Failed') {
    return { _tag: 'Reload' };
  }
  if (check.currentHash !== check.previousHash) {
    return { _tag: 'Retry', acknowledgedClientHash: check.currentHash };
  }
  if (check.updatedModules !== null && check.updatedModules.length > 0) {
    return { _tag: 'Reload' };
  }
  return pending.rscRefresh === 'Pending'
    ? { _tag: 'Retry', acknowledgedClientHash: pending.clientHash }
    : { _tag: 'Reload' };
};
