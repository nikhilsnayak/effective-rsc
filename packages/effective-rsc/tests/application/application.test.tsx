import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';

import { Application, type ApplicationServices } from '../../src/application/definition';
import { Layout, type LayoutProps } from '../../src/application/layout';
import { Loading } from '../../src/application/loading';
import { Page } from '../../src/application/page';
import type { RenderRuntime } from '../../src/application/render-runtime';

const asElement = <Props,>(node: ReactNode): ReactElement<Props> => {
  if (!isValidElement<Props>(node)) {
    throw new Error('Expected a React element.');
  }

  return node;
};

const runtime: RenderRuntime<never> = (effect) => Effect.runPromise(effect);

const RootLayout = Layout.make(
  Effect.fnUntraced(function* ({ children }: LayoutProps) {
    return yield* Effect.succeed(<main>{children}</main>);
  }),
);
const RootLoading = Loading.make(() => <p>Loading...</p>);
const HomePage = Page.make(() => Effect.succeed(<h1>Home</h1>));

class LayoutService extends Context.Service<LayoutService, object>()(
  'effective-rsc/tests/application/LayoutService',
) {}

class PageService extends Context.Service<PageService, object>()(
  'effective-rsc/tests/application/PageService',
) {}

class LayerDependency extends Context.Service<LayerDependency, object>()(
  'effective-rsc/tests/application/LayerDependency',
) {}

describe('Application.make', () => {
  it('composes the explicit root layout and page', () => {
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          page: HomePage,
        },
      },
    });
    const root = asElement<{ readonly children: ReactNode }>(App.component({ runtime }));
    const page = asElement<{ readonly runtime: RenderRuntime<never> }>(root.props.children);

    expect(root.type).toBe(RootLayout);
    expect(page.type).toBe(HomePage);
    expect(page.props.runtime).toBe(runtime);
  });

  it('places the optional loading concern in a native Suspense boundary', () => {
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          loading: RootLoading,
          page: HomePage,
        },
      },
    });
    const root = asElement<{ readonly children: ReactNode }>(App.component({ runtime }));
    const suspense = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(root.props.children);
    const fallback = asElement(suspense.props.fallback);
    const page = asElement<{ readonly runtime: RenderRuntime<never> }>(suspense.props.children);

    expect(suspense.type).toBe(Suspense);
    expect(fallback.type).toBe(RootLoading);
    expect(page.type).toBe(HomePage);
    expect(page.props.runtime).toBe(runtime);
  });

  it('combines layout and page service requirements', () => {
    const ServiceLayout = Layout.make(
      Effect.fnUntraced(function* ({ children }: LayoutProps) {
        yield* LayoutService;
        return children;
      }),
    );
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    );
    const ApplicationLayer = Layer.mergeAll(
      Layer.succeed(LayoutService, LayoutService.of({})),
      Layer.succeed(PageService, PageService.of({})),
    );
    const App = Application.make({
      routes: {
        '/': {
          layout: ServiceLayout,
          page: ServicePage,
        },
      },
      servicesLayer: ApplicationLayer,
    });
    type Services = ApplicationServices<typeof App>;
    const servicesAreCombined: [Services] extends [LayoutService | PageService]
      ? [LayoutService | PageService] extends [Services]
        ? true
        : false
      : false = true;

    expect(servicesAreCombined).toBe(true);
    expect(App.servicesLayer).toBe(ApplicationLayer);
  });

  it('requires a closed application Layer for route services', () => {
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    );
    const routes = {
      '/': {
        layout: RootLayout,
        page: ServicePage,
      },
    };

    // @ts-expect-error Every inferred route service must be supplied by the application Layer.
    Application.make({ routes });

    const IncompleteApplicationLayer = Layer.effect(
      PageService,
      Effect.as(LayerDependency, PageService.of({})),
    );

    Application.make({
      routes,
      // @ts-expect-error The application Layer must have no remaining service requirements.
      servicesLayer: IncompleteApplicationLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
    });

    expect(true).toBe(true);
  });

  it('requires factory-created route concerns', () => {
    const ArbitraryLayout = ({ children }: { readonly children: ReactNode }) => (
      <main>{children}</main>
    );
    const ArbitraryLoading = () => <p>Loading...</p>;
    const ArbitraryPage = () => <h1>Home</h1>;

    Application.make<never, never>({
      routes: {
        '/': {
          // @ts-expect-error Layout concerns must be created with Layout.make.
          layout: ArbitraryLayout,
          page: HomePage,
        },
      },
    });
    Application.make<never, never>({
      routes: {
        '/': {
          layout: RootLayout,
          // @ts-expect-error Loading concerns must be created with Loading.make.
          loading: ArbitraryLoading,
          page: HomePage,
        },
      },
    });
    Application.make<never, never>({
      routes: {
        '/': {
          layout: RootLayout,
          // @ts-expect-error Page concerns must be created with Page.make.
          page: ArbitraryPage,
        },
      },
    });

    expect(true).toBe(true);
  });
});
