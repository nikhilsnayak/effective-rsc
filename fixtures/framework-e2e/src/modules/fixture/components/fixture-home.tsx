import { Effect } from 'effect';
import { ArrowRight, Database, Layers3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import type { FixtureMetadata, ObservedQuery, SelectionItem } from '@/modules/fixture/model';
import { FixtureService } from '@/modules/fixture/service';
import { SelectionToggle } from '@/modules/selection/components/selection-toggle';

import RuntimeProbe from './runtime-probe';

type FixtureHomeProps = {
  readonly fixture: ObservedQuery<FixtureMetadata>;
  readonly selection: ObservedQuery<ReadonlyArray<SelectionItem>>;
};

const groups = [
  {
    description: 'Document rendering, nested layouts, Loading, and streamed components.',
    href: '/catalog/primary',
    label: 'Primary',
    slot: 'A',
  },
  {
    description: 'Traversal caching, Server Functions, supersession, and slow streams.',
    href: '/catalog/secondary',
    label: 'Secondary',
    slot: 'B',
  },
] as const;

function FixtureHomeView({ fixture, selection }: FixtureHomeProps) {
  return (
    <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
      <header className='max-w-3xl border-b pb-9'>
        <Badge variant='outline'>{fixture.data.revision}</Badge>
        <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl'>
          {fixture.data.name}
        </h1>
        <p className='text-muted-foreground mt-4 text-lg leading-8 text-pretty'>
          {fixture.data.description}
        </p>
        <div className='text-muted-foreground mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
          <span className='inline-flex items-center gap-1.5'>
            <Layers3 aria-hidden='true' className='size-4' />
            {fixture.data.runtime}
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <Database aria-hidden='true' className='size-4' />
            {fixture.data.storage}
          </span>
        </div>
      </header>

      <RuntimeProbe />
      {/* Outside Suspense so native forms remain visible even without reveal scripts. */}
      <SelectionToggle
        itemId='service-layer'
        isSelected={selection.data.some((item) => item.id === 'service-layer')}
      />
      <section className='grid gap-4 py-9 sm:grid-cols-2' aria-label='Fixture route groups'>
        {groups.map((group) => (
          <Card key={group.href}>
            <CardHeader>
              <Badge variant='outline'>{`Group ${group.slot}`}</Badge>
              <CardTitle className='mt-3 text-2xl tracking-[-0.02em]'>{group.label}</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col items-start gap-5'>
              <p className='text-muted-foreground leading-7 text-pretty'>{group.description}</p>
              <a
                aria-label={`Open the ${group.label} catalog`}
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={group.href}
              >
                {`Open ${group.label}`}
                <ArrowRight aria-hidden='true' />
              </a>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

export const FixtureHomePage = ERSC.Page.make({
  render: Effect.fn('FixtureHomePage')(function* () {
    const service = yield* FixtureService;
    const fixture = yield* service.fixture;
    const selection = yield* service.selection;

    return <FixtureHomeView fixture={fixture} selection={selection} />;
  }),
});
