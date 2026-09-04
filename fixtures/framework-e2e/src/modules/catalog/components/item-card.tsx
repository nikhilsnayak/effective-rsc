import { Hash } from 'lucide-react';
import { Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemDetail } from '@/modules/catalog/components/item-detail';
import type { Item } from '@/modules/fixture/model';
import { SelectionToggle } from '@/modules/selection/components/selection-toggle';
import { toggleSelection } from '@/modules/selection/server-functions';

export function ItemCard({ item }: { readonly item: Item }) {
  const toggleSelectionAction = toggleSelection.bind(null, { itemId: item.id });

  return (
    <Card className='gap-0 rounded-lg py-0 shadow-none'>
      <article className='grid sm:grid-cols-[7.5rem_minmax(0,1fr)]'>
        <div className='border-b px-5 py-5 sm:border-r sm:border-b-0'>
          <p className='font-mono text-sm font-semibold'>{item.slot}</p>
          <p className='text-muted-foreground mt-1 font-mono text-xs'>fixture item</p>
        </div>
        <CardContent className='px-5 py-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{item.category}</Badge>
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
              <Hash aria-hidden='true' className='size-3.5' />
              {item.id}
            </span>
          </div>
          <h2 className='mt-3 text-lg font-semibold tracking-tight'>{item.title}</h2>
          <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-6'>
            {item.description}
          </p>
          <Suspense
            fallback={
              <div className='mt-4 flex items-center gap-2' aria-label='Loading detail'>
                <Skeleton className='h-5 w-28' />
                <Skeleton className='h-5 w-40' />
              </div>
            }
          >
            <ItemDetail detailId={item.detailId} />
          </Suspense>
          <SelectionToggle action={toggleSelectionAction} isSelected={item.isSelected} />
        </CardContent>
      </article>
    </Card>
  );
}
