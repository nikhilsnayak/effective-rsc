import { Brand, Effect, Fiber, FiberHandle, SynchronizedRef } from 'effect';

export type NavigationRevision = Brand.Branded<number, 'NavigationRevision'>;

export type RenderCommit = {
  /** Completes after React commits the exact scheduled render. */
  readonly committed: Effect.Effect<void>;
};

export type NavigationResource<Snapshot> = {
  readonly release: Effect.Effect<void>;
  readonly snapshot: Snapshot;
};

export type ScheduledNavigation<Snapshot> = {
  readonly revision: NavigationRevision;
  readonly snapshot: Snapshot;
};

type RenderDecision =
  | { readonly _tag: 'Stale' }
  | { readonly _tag: 'Scheduled'; readonly commit: RenderCommit };

const NavigationRevision = Brand.nominal<NavigationRevision>();
const initialRevision = NavigationRevision(0);

const make = Effect.fnUntraced(function* <
  Destination,
  Snapshot,
  LoadError,
  LoadServices,
  ScheduleError,
>(options: {
  readonly load: (
    destination: Destination,
  ) => Effect.Effect<NavigationResource<Snapshot>, LoadError, LoadServices>;
  /** Submits the snapshot to React and returns its exact commit signal. */
  readonly scheduleRender: (
    navigation: ScheduledNavigation<Snapshot>,
  ) => Effect.Effect<RenderCommit, ScheduleError>;
}) {
  const latestRevision = yield* SynchronizedRef.make(initialRevision);
  const activeNavigation = yield* FiberHandle.make<void, LoadError | ScheduleError>();

  const awaitCommit = Effect.fnUntraced(function* ({
    resource,
    revision,
  }: {
    readonly resource: NavigationResource<Snapshot>;
    readonly revision: NavigationRevision;
  }) {
    const decision = yield* SynchronizedRef.modifyEffect(
      latestRevision,
      (current): Effect.Effect<readonly [RenderDecision, NavigationRevision], ScheduleError> => {
        if (current !== revision) {
          return Effect.succeed([{ _tag: 'Stale' }, current] as const);
        }

        return options.scheduleRender({ revision, snapshot: resource.snapshot }).pipe(
          Effect.map(
            (commit) =>
              [
                {
                  _tag: 'Scheduled',
                  commit,
                },
                current,
              ] as const,
          ),
        );
      },
    );

    switch (decision._tag) {
      case 'Stale':
        return yield* Effect.interrupt;
      case 'Scheduled':
        return yield* decision.commit.committed;
    }
  });

  const runNavigation = Effect.fnUntraced(function* ({
    destination,
    revision,
  }: {
    readonly destination: Destination;
    readonly revision: NavigationRevision;
  }) {
    return yield* Effect.uninterruptibleMask((restore) =>
      restore(options.load(destination)).pipe(
        Effect.flatMap((resource) =>
          restore(awaitCommit({ resource, revision })).pipe(Effect.onError(() => resource.release)),
        ),
      ),
    );
  });

  const navigate = Effect.fnUntraced(function* (destination: Destination) {
    return yield* Effect.uninterruptibleMask((restore) =>
      SynchronizedRef.modifyEffect(latestRevision, (current) => {
        const revision = NavigationRevision(current + 1);

        return FiberHandle.run(activeNavigation, runNavigation({ destination, revision })).pipe(
          Effect.map((navigationFiber) => [navigationFiber, revision] as const),
        );
      }).pipe(
        Effect.flatMap((navigationFiber) =>
          restore(Fiber.join(navigationFiber)).pipe(
            Effect.onInterrupt(() => Fiber.interrupt(navigationFiber)),
          ),
        ),
      ),
    );
  });

  return { navigate };
});

export const NavigationStateMachine = { make } as const;
