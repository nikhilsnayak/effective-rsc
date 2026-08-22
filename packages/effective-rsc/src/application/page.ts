import type { Effect } from 'effect';
import type { ReactNode } from 'react';

import type { RenderRuntime } from './render-runtime';

declare const PageTypeId: unique symbol;

export type PageConcern = {
  readonly [PageTypeId]: typeof PageTypeId;
};

type PageProps<Services> = {
  readonly runtime: RenderRuntime<Services>;
};

export type PageComponent<Services> = PageConcern & {
  (props: PageProps<Services>): Promise<Awaited<ReactNode>>;
};

const make = <Output extends Awaited<ReactNode>, Error, Services>(
  operation: () => Effect.Effect<Output, Error, Services>,
) => {
  const PageComponent = ({ runtime }: PageProps<Services>) => {
    return runtime(operation());
  };

  return PageComponent as unknown as PageComponent<Services>;
};

export const Page = { make } as const;
