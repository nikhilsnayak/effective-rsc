import { Effect, Schema } from 'effect';
import { ArrowRight, Layers3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ItemCard } from '@/modules/catalog/components/item-card';
import { ActorERSC, CurrentActor } from '@/modules/fixture/actor';
import type { ObservedQuery, Catalog } from '@/modules/fixture/model';
import { FixtureService } from '@/modules/fixture/service';

type CatalogViewProps = {
  readonly actorName: string | null;
  readonly catalog: ObservedQuery<Catalog>;
};

function CatalogView({ actorName, catalog }: CatalogViewProps) {
  const isPrimary = catalog.data.group === 'primary';

  return (
    <main
      className='min-w-0 py-8 lg:py-10'
      data-catalog-completed-at={catalog.completedAt}
      data-catalog-started-at={catalog.startedAt}
    >
      <header className='border-b pb-7'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>Group {isPrimary ? 'A' : 'B'}</Badge>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'>
            <Layers3 aria-hidden='true' className='size-4' />
            Parameterized Page
          </span>
        </div>
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl'>
          {`${catalog.data.label} catalog`}
        </h1>
        <p className='text-muted-foreground mt-3 max-w-2xl leading-7 text-pretty'>
          {catalog.data.description}
        </p>
        {actorName === null ? null : (
          <p className='text-muted-foreground mt-2 text-sm'>Personalized for {actorName}</p>
        )}
      </header>

      <section className='py-7' aria-label={`${catalog.data.label} items`}>
        <div className='space-y-3'>
          {catalog.data.items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <footer className='flex justify-end border-t pt-6'>
        <a
          aria-label={isPrimary ? 'Open Secondary' : 'Open Primary'}
          className={cn(buttonVariants({ variant: 'outline' }))}
          href={isPrimary ? '/catalog/secondary' : '/catalog/primary'}
        >
          {isPrimary ? 'Open Secondary' : 'Open Primary'}
          <ArrowRight aria-hidden='true' />
        </a>
      </footer>
    </main>
  );
}

export const CatalogPage = ActorERSC.Page.make({
  params: Schema.Struct({
    group: Schema.Literals(['primary', 'secondary']),
  }),
  render: Effect.fn('CatalogPage')(function* ({ params }) {
    const actor = yield* CurrentActor;
    const service = yield* FixtureService;
    const catalog = yield* service.catalog(params.group);

    return <CatalogView actorName={actor.name} catalog={catalog} />;
  }),
});
