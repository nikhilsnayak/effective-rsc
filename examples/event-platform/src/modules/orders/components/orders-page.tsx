import { DateTime, Effect, Schema } from 'effect';
import { ArrowLeft, ReceiptText, ShieldCheck } from 'lucide-react';
import { ViewTransition } from 'react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RefundOrderAction } from '@/modules/orders/components/refund-order-action';
import { OrdersAccessDenied } from '@/modules/orders/model';
import { OrdersService } from '@/modules/orders/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { currency, style: 'currency' }).format(minor / 100);

const orderDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    dateStyle: 'medium',
    locale: 'en',
    timeStyle: 'short',
  });

export const OrdersPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('OrdersPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* OrdersService;
    const workspace = yield* service
      .workspace(userId, params.eventId)
      .pipe(
        Effect.catch((error) =>
          Schema.is(OrdersAccessDenied)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
    if (workspace === null) {
      return (
        <NavigationTransition>
          <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
            <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
            <h1 className='mt-4 text-3xl font-semibold'>Order access required</h1>
            <p className='text-muted-foreground mt-3'>Your organizer role cannot manage orders.</p>
          </main>
        </NavigationTransition>
      );
    }

    return (
      <NavigationTransition key={`orders-${workspace.event.eventId}`}>
        <main className='mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' /> Organizer studio
          </a>
          <header className='mt-6 border-b pb-8'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>{workspace.event.organizationName}</Badge>
              <Badge variant='secondary'>{workspace.event.status}</Badge>
            </div>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
              {workspace.event.eventName} orders
            </h1>
            <p className='text-muted-foreground mt-3'>
              Review purchases and issue audited refunds.
            </p>
          </header>
          <section className='py-8' aria-labelledby='orders-heading'>
            <div className='flex items-center justify-between gap-4'>
              <h2 className='text-2xl font-semibold' id='orders-heading'>
                Orders
              </h2>
              <span className='text-muted-foreground text-sm'>{workspace.orders.length}</span>
            </div>
            {workspace.orders.length === 0 ? (
              <Empty className='border-border mt-5 border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <ReceiptText aria-hidden='true' />
                  </EmptyMedia>
                  <EmptyTitle>No orders yet</EmptyTitle>
                  <EmptyDescription>
                    Completed and attempted checkouts appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className='mt-5 grid gap-4'>
                {workspace.orders.map((order) => (
                  <ViewTransition
                    default='none'
                    enter='reveal-in'
                    exit='reveal-out'
                    key={order.orderId}
                    update='auto'
                  >
                    <Card>
                      <CardHeader>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <Badge variant={order.status === 'failed' ? 'destructive' : 'outline'}>
                            {order.status}
                          </Badge>
                          <strong className='tabular-nums'>
                            {money(order.totalMinor, order.currency)}
                          </strong>
                        </div>
                        <CardTitle className='mt-3'>{order.buyerName}</CardTitle>
                      </CardHeader>
                      <CardContent className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
                        <div className='text-muted-foreground grid gap-1 text-sm'>
                          <span>{order.buyerEmail}</span>
                          <span>
                            {order.ticketTypeName}
                            {order.ticketCode ? ` · ${order.ticketCode}` : ''}
                          </span>
                          <span>{orderDate(order.createdAt)}</span>
                          {order.registrationAnswers ? (
                            <span className='text-foreground mt-2 whitespace-pre-line'>
                              {order.registrationAnswers}
                            </span>
                          ) : null}
                          {order.refundReason ? (
                            <span>
                              Refunded {order.refundedAt ? orderDate(order.refundedAt) : ''} ·{' '}
                              {order.refundReason}
                            </span>
                          ) : null}
                        </div>
                        {order.status === 'paid' ? (
                          <RefundOrderAction
                            eventId={workspace.event.eventId}
                            orderId={order.orderId}
                          />
                        ) : null}
                      </CardContent>
                    </Card>
                  </ViewTransition>
                ))}
              </div>
            )}
          </section>
        </main>
      </NavigationTransition>
    );
  }),
});
