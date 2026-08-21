import { Layer } from 'effect';
import { Suspense, type ReactNode } from 'react';

import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { PageComponent } from './page';
import type { RenderRuntime } from './render-runtime';

type RootRoute<LayoutServices, PageServices> = {
  readonly layout: LayoutComponent<LayoutServices>;
  readonly loading?: LoadingComponent;
  readonly page: PageComponent<PageServices>;
};

type Routes<LayoutServices, PageServices> = {
  readonly '/': RootRoute<LayoutServices, PageServices>;
};

type ApplicationComponentProps<Services> = {
  readonly runtime: RenderRuntime<Services>;
};

export type ApplicationComponent<Services> = (
  props: ApplicationComponentProps<Services>,
) => ReactNode;

export type ApplicationDefinition<Services, ApplicationError = never> = {
  readonly component: ApplicationComponent<Services>;
  readonly servicesLayer: Layer.Layer<Services, ApplicationError>;
};

export type ApplicationServices<Application> =
  Application extends ApplicationDefinition<infer Services, infer _ApplicationError>
    ? Services
    : never;

type ServicesLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? { readonly servicesLayer?: Layer.Layer<never, ApplicationError> }
  : { readonly servicesLayer: Layer.Layer<Services, ApplicationError> };

type ApplicationOptions<LayoutServices, PageServices, ApplicationError> = {
  readonly routes: Routes<LayoutServices, PageServices>;
} & ServicesLayerOptions<LayoutServices | PageServices, ApplicationError>;

function resolveServicesLayer<Services, ApplicationError>(
  servicesLayer:
    | Layer.Layer<Services, ApplicationError>
    | Layer.Layer<never, ApplicationError>
    | undefined,
): Layer.Layer<Services, ApplicationError>;
function resolveServicesLayer(servicesLayer: Layer.Any | undefined): Layer.Any {
  return servicesLayer ?? Layer.empty;
}

const make = <LayoutServices, PageServices, ApplicationError = never>(
  options: ApplicationOptions<LayoutServices, PageServices, ApplicationError>,
): ApplicationDefinition<LayoutServices | PageServices, ApplicationError> => {
  const { routes, servicesLayer } = options;
  const { layout: Layout, loading: Loading, page: Page } = routes['/'];

  function RootComponent({ runtime }: ApplicationComponentProps<LayoutServices | PageServices>) {
    const page = <Page runtime={runtime} />;
    const content = Loading ? <Suspense fallback={<Loading />}>{page}</Suspense> : page;

    return <Layout runtime={runtime}>{content}</Layout>;
  }

  return {
    component: RootComponent,
    servicesLayer: resolveServicesLayer<LayoutServices | PageServices, ApplicationError>(
      servicesLayer,
    ),
  };
};

export const Application = { make } as const;
