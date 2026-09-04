import { Download, ListChecks } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SelectionItem, ObservedQuery } from '@/modules/fixture/model';

type FixtureSelectionProps = {
  readonly selection: ObservedQuery<ReadonlyArray<SelectionItem>>;
};

export default function FixtureSelection({ selection }: FixtureSelectionProps) {
  return (
    <section
      aria-labelledby='fixture-selection-heading'
      data-selection-completed-at={selection.completedAt}
      data-selection-started-at={selection.startedAt}
    >
      <div className='flex items-center gap-2'>
        <ListChecks aria-hidden='true' className='size-4' />
        <h2 id='fixture-selection-heading' className='text-sm font-semibold'>
          Fixture selection
        </h2>
        <Badge className='ml-auto' variant='secondary'>
          {selection.data.length}
        </Badge>
      </div>
      <ol className='mt-4 divide-y border-y'>
        {selection.data.map((item) => (
          <li key={item.id} className='py-4 first:pt-3 last:pb-3'>
            <p className='text-muted-foreground font-mono text-xs tabular-nums'>
              {item.groupLabel} · {item.slot}
            </p>
            <p className='mt-1.5 text-sm leading-5 font-medium'>{item.title}</p>
            <p className='text-muted-foreground mt-2 text-xs'>{item.id}</p>
          </li>
        ))}
      </ol>
      <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs leading-5'>
          SQL-backed state shared by Server Components and Server Functions.
        </p>
        <a
          className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
          download
          href='/selection/export.csv'
        >
          <Download aria-hidden='true' />
          Export selection
        </a>
      </div>
    </section>
  );
}
