import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Ref, Schema, Scope } from 'effect';

import {
  NavigationStateMachine,
  type NavigationResource,
  type ScheduledNavigation,
} from '../../src/client/navigation-state';

const navigationResource = <Snapshot>(
  snapshot: Snapshot,
  release: Effect.Effect<void> = Effect.void,
): NavigationResource<Snapshot> => ({ release, snapshot });

class TestScheduleError extends Schema.TaggedError<TestScheduleError>()('TestScheduleError', {}) {}

describe('NavigationStateMachine', () => {
  it.effect('waits for the exact scheduled render to commit', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const scheduled = yield* Deferred.make<ScheduledNavigation<string>>();
        const committed = yield* Deferred.make<void>();
        const committedResources = yield* Ref.make<ReadonlyArray<string>>([]);
        const navigationState = yield* NavigationStateMachine.make({
          load: (destination: string) =>
            Effect.succeed(navigationResource(`snapshot:${destination}`)),
          scheduleRender: (navigation) =>
            Deferred.succeed(scheduled, navigation).pipe(
              Effect.as({
                committed: Deferred.await(committed).pipe(
                  Effect.andThen(
                    Ref.update(committedResources, (snapshots) => [
                      ...snapshots,
                      navigation.snapshot,
                    ]),
                  ),
                ),
              }),
            ),
        });
        const navigationFiber = yield* Effect.forkChild(navigationState.navigate('/schedule'));
        const navigation = yield* Deferred.await(scheduled);

        expect(navigation.snapshot).toBe('snapshot:/schedule');
        expect(navigationFiber.pollUnsafe()).toBeUndefined();
        expect(yield* Ref.get(committedResources)).toEqual([]);

        yield* Deferred.succeed(committed, void 0);
        yield* Fiber.join(navigationFiber);

        expect(yield* Ref.get(committedResources)).toEqual(['snapshot:/schedule']);
      }),
    ),
  );

  it.effect('interrupts and releases a superseded scheduled render', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstScheduled = yield* Deferred.make<void>();
        const secondScheduled = yield* Deferred.make<void>();
        const firstCommit = yield* Deferred.make<void>();
        const secondCommit = yield* Deferred.make<void>();
        const released = yield* Ref.make<ReadonlyArray<string>>([]);
        const committed = yield* Ref.make<ReadonlyArray<string>>([]);
        const scheduledNavigations: Array<ScheduledNavigation<string>> = [];
        const navigationState = yield* NavigationStateMachine.make({
          load: (destination: string) =>
            Effect.succeed(
              navigationResource(
                `snapshot:${destination}`,
                Ref.update(released, (snapshots) => [...snapshots, destination]),
              ),
            ),
          scheduleRender: (navigation) =>
            Effect.gen(function* () {
              scheduledNavigations.push(navigation);
              if (navigation.snapshot === 'snapshot:/first') {
                yield* Deferred.succeed(firstScheduled, void 0);
                return {
                  committed: Deferred.await(firstCommit).pipe(
                    Effect.andThen(
                      Ref.update(committed, (snapshots) => [...snapshots, navigation.snapshot]),
                    ),
                  ),
                };
              }

              yield* Deferred.succeed(secondScheduled, void 0);
              return {
                committed: Deferred.await(secondCommit).pipe(
                  Effect.andThen(
                    Ref.update(committed, (snapshots) => [...snapshots, navigation.snapshot]),
                  ),
                ),
              };
            }),
        });
        const firstFiber = yield* Effect.forkChild(navigationState.navigate('/first'));

        yield* Deferred.await(firstScheduled);
        const secondFiber = yield* Effect.forkChild(navigationState.navigate('/second'));
        yield* Deferred.await(secondScheduled);

        const firstExit = yield* Fiber.await(firstFiber);
        const [firstNavigation, secondNavigation] = scheduledNavigations;
        if (firstNavigation === undefined || secondNavigation === undefined) {
          return yield* Effect.die('Expected both navigations to be scheduled.');
        }

        expect(Exit.hasInterrupts(firstExit)).toBe(true);
        expect(secondNavigation.revision).toBeGreaterThan(firstNavigation.revision);
        expect(yield* Ref.get(released)).toEqual(['/first']);

        yield* Deferred.succeed(firstCommit, void 0);
        yield* Deferred.succeed(secondCommit, void 0);
        yield* Fiber.join(secondFiber);

        expect(yield* Ref.get(committed)).toEqual(['snapshot:/second']);
      }),
    ),
  );

  it.effect('does not schedule a stale response from uninterruptible loading work', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstStarted = yield* Deferred.make<void>();
        const releaseFirstLoad = yield* Deferred.make<void>();
        const secondScheduled = yield* Deferred.make<void>();
        const secondCommit = yield* Deferred.make<void>();
        const scheduledNavigations: Array<ScheduledNavigation<string>> = [];
        const navigationState = yield* NavigationStateMachine.make({
          load: (destination: string) => {
            const resource = navigationResource(`snapshot:${destination}`);

            return destination === '/first'
              ? Deferred.succeed(firstStarted, void 0).pipe(
                  Effect.andThen(Deferred.await(releaseFirstLoad)),
                  Effect.uninterruptible,
                  Effect.andThen(Effect.succeed(resource)),
                )
              : Effect.succeed(resource);
          },
          scheduleRender: (navigation) =>
            Effect.sync(() => {
              scheduledNavigations.push(navigation);
            }).pipe(
              Effect.andThen(Deferred.succeed(secondScheduled, void 0)),
              Effect.as({ committed: Deferred.await(secondCommit) }),
            ),
        });
        const firstFiber = yield* Effect.forkChild(navigationState.navigate('/first'));

        yield* Deferred.await(firstStarted);
        const secondFiber = yield* Effect.forkChild(navigationState.navigate('/second'));
        yield* Deferred.await(secondScheduled);
        yield* Deferred.succeed(releaseFirstLoad, void 0);

        const firstExit = yield* Fiber.await(firstFiber);
        expect(Exit.hasInterrupts(firstExit)).toBe(true);
        expect(scheduledNavigations).toHaveLength(1);
        expect(scheduledNavigations[0]?.snapshot).toBe('snapshot:/second');

        yield* Deferred.succeed(secondCommit, void 0);
        yield* Fiber.join(secondFiber);
      }),
    ),
  );

  it.effect('interrupts active loading when its navigation caller is interrupted', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const loadingStarted = yield* Deferred.make<void>();
        const loadingInterrupted = yield* Deferred.make<void>();
        const navigationState = yield* NavigationStateMachine.make({
          load: (_destination: string) =>
            Deferred.succeed(loadingStarted, void 0).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(loadingInterrupted, void 0)),
            ),
          scheduleRender: (_navigation) => Effect.succeed({ committed: Effect.void }),
        });
        const navigationFiber = yield* Effect.forkChild(navigationState.navigate('/schedule'));

        yield* Deferred.await(loadingStarted);
        const interruptionFiber = yield* Effect.forkChild(Fiber.interrupt(navigationFiber));

        yield* Deferred.await(loadingInterrupted);
        yield* Fiber.join(interruptionFiber);
      }),
    ),
  );

  it.effect('releases a resource when interruption arrives as loading completes', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const loadingStarted = yield* Deferred.make<void>();
        const finishLoading = yield* Deferred.make<void>();
        const released = yield* Ref.make(false);
        const scheduled = yield* Ref.make(false);
        const navigationState = yield* NavigationStateMachine.make({
          load: (_destination: string) =>
            Deferred.succeed(loadingStarted, void 0).pipe(
              Effect.andThen(Deferred.await(finishLoading)),
              Effect.as(navigationResource('snapshot', Ref.set(released, true))),
              Effect.uninterruptible,
            ),
          scheduleRender: (_navigation) =>
            Ref.set(scheduled, true).pipe(Effect.as({ committed: Effect.void })),
        });
        const navigationFiber = yield* Effect.forkChild(navigationState.navigate('/schedule'));

        yield* Deferred.await(loadingStarted);
        const interruptionFiber = yield* Effect.forkChild(Fiber.interrupt(navigationFiber));
        yield* Deferred.succeed(finishLoading, void 0);
        yield* Fiber.join(interruptionFiber);

        expect(yield* Ref.get(released)).toBe(true);
        expect(yield* Ref.get(scheduled)).toBe(false);
      }),
    ),
  );

  it.effect('releases the loaded resource when React scheduling fails', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const released = yield* Ref.make(false);
        const navigationState = yield* NavigationStateMachine.make({
          load: (_destination: string) =>
            Effect.succeed(navigationResource('snapshot', Ref.set(released, true))),
          scheduleRender: (_navigation) => new TestScheduleError(),
        });

        const error = yield* navigationState.navigate('/schedule').pipe(Effect.flip);

        expect(error).toBeInstanceOf(TestScheduleError);
        expect(yield* Ref.get(released)).toBe(true);
      }),
    ),
  );

  it.effect('releases a scheduled resource when the state-machine scope closes', () =>
    Effect.gen(function* () {
      const scheduled = yield* Ref.make(false);
      const committed = yield* Deferred.make<void>();
      const released = yield* Ref.make(false);

      const stateMachineScope = yield* Scope.make();
      const navigationState = yield* NavigationStateMachine.make({
        load: (_destination: string) =>
          Effect.succeed(navigationResource('snapshot', Ref.set(released, true))),
        scheduleRender: (_navigation) =>
          Ref.set(scheduled, true).pipe(Effect.as({ committed: Deferred.await(committed) })),
      }).pipe(Effect.provideService(Scope.Scope, stateMachineScope));
      const navigationFiber = yield* Effect.forkChild(navigationState.navigate('/schedule'));

      while (!(yield* Ref.get(scheduled))) {
        yield* Effect.yieldNow;
      }
      yield* Effect.yieldNow;
      yield* Scope.close(stateMachineScope, Exit.void);
      const navigationExit = yield* Fiber.await(navigationFiber);

      expect(Exit.hasInterrupts(navigationExit)).toBe(true);
      expect(yield* Ref.get(released)).toBe(true);
    }),
  );
});
