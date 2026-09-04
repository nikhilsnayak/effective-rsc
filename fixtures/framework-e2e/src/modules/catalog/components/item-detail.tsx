import { Effect } from 'effect';

import { ERSC } from '@/ersc';
import { FixtureService } from '@/modules/fixture/service';

type ItemDetailProps = {
  readonly detailId: string;
};

export const ItemDetail = ERSC.Component.make({
  render: Effect.fn('ItemDetail')(function* ({ detailId }: ItemDetailProps) {
    const service = yield* FixtureService;
    const detail = yield* service.detail(detailId);

    return (
      <div
        className='mt-4 flex items-center gap-2 text-sm'
        data-detail-completed-at={detail.completedAt}
        data-detail-id={detail.data.id}
        data-detail-started-at={detail.startedAt}
      >
        <span className='font-medium'>{detail.data.label}</span>
        <span aria-hidden='true' className='text-border'>
          /
        </span>
        <span className='text-muted-foreground'>{detail.data.description}</span>
      </div>
    );
  }),
});
