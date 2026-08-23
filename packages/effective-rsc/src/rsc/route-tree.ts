export type RouteTree<Data> = {
  readonly key: string;
  readonly data: Data;
  /**
   * Structural route metadata, independent of this render's Loading output.
   * It remains available on RouteTree<null> and when a Loading concern renders null.
   */
  readonly hasLoadingBoundary: boolean;
  readonly slots: Readonly<Record<string, RouteTree<Data> | null>>;
};

export type RouteDataPatch<Data> =
  | { readonly _tag: 'Preserve' }
  | { readonly _tag: 'Replace'; readonly data: Data };

export type RouteTreePatch<Data> = {
  readonly key: string;
  readonly data: RouteDataPatch<Data>;
  readonly slots: Readonly<Record<string, RouteTreePatch<Data> | null>>;
};

const PreserveRouteData = { _tag: 'Preserve' } as const;

export const RouteDataPatch = {
  preserve: PreserveRouteData,
  replace: <Data>(data: Data): RouteDataPatch<Data> => ({ _tag: 'Replace', data }),
} as const;

export const stripRouteTreeData = <Data>(tree: RouteTree<Data>): RouteTree<null> => {
  const slots: Record<string, RouteTree<null> | null> = {};

  for (const [name, child] of Object.entries(tree.slots)) {
    slots[name] = child === null ? null : stripRouteTreeData(child);
  }

  return {
    key: tree.key,
    data: null,
    hasLoadingBoundary: tree.hasLoadingBoundary,
    slots,
  };
};

export const overlayRouteTree = <Data>(
  current: RouteTree<Data>,
  patch: RouteTreePatch<Data>,
): RouteTree<Data> => {
  if (current.key !== patch.key) {
    throw new TypeError(
      `Cannot overlay route node "${patch.key}" onto route node "${current.key}".`,
    );
  }

  const slots: Record<string, RouteTree<Data> | null> = { ...current.slots };

  for (const [name, childPatch] of Object.entries(patch.slots)) {
    if (!Object.hasOwn(current.slots, name)) {
      throw new TypeError(`Route node "${current.key}" does not declare slot "${name}".`);
    }

    if (childPatch === null) {
      slots[name] = null;
      continue;
    }

    const currentChild = current.slots[name];
    if (currentChild === null || currentChild === undefined) {
      throw new TypeError(
        `Cannot overlay route node "${childPatch.key}" onto empty slot "${name}" of route node "${current.key}".`,
      );
    }

    slots[name] = overlayRouteTree(currentChild, childPatch);
  }

  return {
    key: current.key,
    data: patch.data._tag === 'Replace' ? patch.data.data : current.data,
    hasLoadingBoundary: current.hasLoadingBoundary,
    slots,
  };
};
