import { expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { vi } from 'vitest';

import { getApplicationState } from '../../src/application/definition';
import { getERSCIdentity } from '../../src/application/ersc-identity';
import { getPageState, isPageDefinition } from '../../src/application/page';
import { getRoutesState } from '../../src/application/routes';
import { matchServerFnInvocation } from '../../src/application/server-fn';

it.effect('composes values loaded from a duplicated framework module instance', () =>
  Effect.gen(function* () {
    vi.resetModules();
    const { Application } = yield* Effect.promise(() => import('../../src/application/ersc'));
    const ERSC = Application.ersc();
    const RootLayout = ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) });
    const Page = ERSC.Page.make({ render: () => Effect.succeed(null) });
    const ServerFn = ERSC.ServerFn.make({
      input: Schema.String,
      handler: (input) => Effect.succeed(input),
    });
    const Routes = ERSC.Routes.make({ layout: RootLayout }).page('/', Page);
    const App = ERSC.make({ routes: Routes });

    expect(isPageDefinition(Page)).toBe(true);
    expect(getPageState(Page).paramsSchema).toBeNull();
    expect(getRoutesState(Routes).paths).toEqual(['/']);
    expect(getApplicationState(App).routes).toHaveLength(1);

    const invocation = ServerFn('hello');
    expect(matchServerFnInvocation(invocation, getERSCIdentity(ServerFn))._tag).toBe('Match');
  }),
);
