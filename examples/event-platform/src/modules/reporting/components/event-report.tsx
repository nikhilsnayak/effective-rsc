import { Effect, Schema } from 'effect';
import {
  ArrowLeft,
  BadgeEuro,
  ChartNoAxesCombined,
  CircleCheckBig,
  CreditCard,
  ShieldCheck,
  TicketCheck,
  Users,
} from 'lucide-react';

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
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { PaymentOutcome, TicketSales } from '@/modules/reporting/model';
import { ReportingAccessDenied } from '@/modules/reporting/model';
import { ReportingService } from '@/modules/reporting/service';

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { currency, style: 'currency' }).format(minor / 100);

const percentage = (value: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;

const paymentLabel = (payment: PaymentOutcome) =>
  `${payment.orderCount} ${payment.orderCount === 1 ? 'order' : 'orders'}`;

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>
          Reporting access required
        </h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          Revenue and sales reporting is available to event managers and organization
          administrators.
        </p>
      </main>
    </NavigationTransition>
  );
}

function RevenueValue({ payments }: { readonly payments: ReadonlyArray<PaymentOutcome> }) {
  const paid = payments.filter((payment) => payment.status === 'paid');
  if (paid.length === 0) {
    return <span>—</span>;
  }

  return (
    <span className='flex flex-wrap gap-x-2'>
      {paid.map((payment) => (
        <span key={payment.currency}>{money(payment.totalMinor, payment.currency)}</span>
      ))}
    </span>
  );
}

function TicketRow({ ticket }: { readonly ticket: TicketSales }) {
  const remaining = ticket.quantityTotal - ticket.quantitySold - ticket.quantityReserved;

  return (
    <tr className='border-border border-t'>
      <th className='px-4 py-4 text-left font-medium' scope='row'>
        <span className='block'>{ticket.name}</span>
        <span className='text-muted-foreground mt-1 block text-xs font-normal'>
          {money(ticket.priceMinor, ticket.currency)}
        </span>
      </th>
      <td className='px-4 py-4 text-right tabular-nums'>{ticket.quantitySold}</td>
      <td className='px-4 py-4 text-right tabular-nums'>{ticket.quantityReserved}</td>
      <td className='px-4 py-4 text-right tabular-nums'>{remaining}</td>
      <td className='px-4 py-4 text-right tabular-nums'>{ticket.quantityTotal}</td>
    </tr>
  );
}

export const EventReportPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('EventReportPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ReportingService;
    const report = yield* service
      .eventReport(userId, params.eventId)
      .pipe(
        Effect.catch((error) =>
          Schema.is(ReportingAccessDenied)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
    if (report === null) {
      return <AccessDenied />;
    }

    const attendanceRate = percentage(
      report.summary.checkedInTickets,
      report.summary.issuedTickets,
    );
    const inventoryRate = percentage(report.summary.soldTickets, report.summary.capacity);

    return (
      <NavigationTransition key={`event-report-${report.event.eventId}`}>
        <main className='mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Organizer studio
          </a>

          <header className='mt-6 border-b pb-8'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>{report.event.organizationName}</Badge>
              <Badge variant='secondary'>{report.event.status}</Badge>
            </div>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
              {report.event.eventName} report
            </h1>
            <p className='text-muted-foreground mt-3 max-w-2xl leading-7'>
              A live operational view of inventory, orders, revenue, issued credentials, and venue
              attendance.
            </p>
          </header>

          <section
            className='grid gap-4 py-8 sm:grid-cols-2 xl:grid-cols-4'
            aria-label='Highlights'
          >
            <Card size='sm'>
              <CardHeader>
                <CardTitle className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <BadgeEuro aria-hidden='true' className='size-4' />
                  Gross revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <strong className='block text-2xl font-semibold tabular-nums'>
                  <RevenueValue payments={report.payments} />
                </strong>
                <p className='text-muted-foreground mt-1 text-xs'>Paid orders</p>
              </CardContent>
            </Card>
            <Card size='sm'>
              <CardHeader>
                <CardTitle className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <TicketCheck aria-hidden='true' className='size-4' />
                  Tickets sold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <strong className='block text-2xl font-semibold tabular-nums'>
                  {report.summary.soldTickets} / {report.summary.capacity}
                </strong>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {inventoryRate} of capacity · {report.summary.reservedTickets} reserved
                </p>
              </CardContent>
            </Card>
            <Card size='sm'>
              <CardHeader>
                <CardTitle className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <Users aria-hidden='true' className='size-4' />
                  Issued credentials
                </CardTitle>
              </CardHeader>
              <CardContent>
                <strong className='block text-2xl font-semibold tabular-nums'>
                  {report.summary.issuedTickets}
                </strong>
                <p className='text-muted-foreground mt-1 text-xs'>Active attendee tickets</p>
              </CardContent>
            </Card>
            <Card size='sm'>
              <CardHeader>
                <CardTitle className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <CircleCheckBig aria-hidden='true' className='size-4' />
                  Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <strong className='block text-2xl font-semibold tabular-nums'>
                  {report.summary.checkedInTickets} / {report.summary.issuedTickets}
                </strong>
                <p className='text-muted-foreground mt-1 text-xs'>{attendanceRate} checked in</p>
              </CardContent>
            </Card>
          </section>

          <div className='grid gap-8 border-t py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]'>
            <section aria-labelledby='ticket-sales-heading'>
              <div className='flex items-center gap-2'>
                <ChartNoAxesCombined aria-hidden='true' className='size-5' />
                <h2 className='text-2xl font-semibold' id='ticket-sales-heading'>
                  Ticket mix
                </h2>
              </div>
              {report.ticketSales.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <TicketCheck aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No ticket inventory</EmptyTitle>
                    <EmptyDescription>Add a ticket type to begin selling.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='border-border mt-5 overflow-x-auto rounded-xl border'>
                  <table className='w-full min-w-lg text-sm'>
                    <thead className='bg-muted/50 text-muted-foreground'>
                      <tr>
                        <th className='px-4 py-3 text-left font-medium' scope='col'>
                          Ticket
                        </th>
                        <th className='px-4 py-3 text-right font-medium' scope='col'>
                          Sold
                        </th>
                        <th className='px-4 py-3 text-right font-medium' scope='col'>
                          Held
                        </th>
                        <th className='px-4 py-3 text-right font-medium' scope='col'>
                          Available
                        </th>
                        <th className='px-4 py-3 text-right font-medium' scope='col'>
                          Capacity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.ticketSales.map((ticket) => (
                        <TicketRow key={ticket.ticketTypeId} ticket={ticket} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby='payment-outcomes-heading'>
              <div className='flex items-center gap-2'>
                <CreditCard aria-hidden='true' className='size-5' />
                <h2 className='text-2xl font-semibold' id='payment-outcomes-heading'>
                  Payment outcomes
                </h2>
              </div>
              {report.payments.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <CreditCard aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No orders yet</EmptyTitle>
                    <EmptyDescription>Payment outcomes appear after checkout.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='mt-5 grid gap-3'>
                  {report.payments.map((payment) => (
                    <Card key={`${payment.status}-${payment.currency}`} size='sm'>
                      <CardContent className='flex items-center justify-between gap-4'>
                        <div>
                          <Badge variant={payment.status === 'failed' ? 'destructive' : 'outline'}>
                            {payment.status}
                          </Badge>
                          <p className='text-muted-foreground mt-2 text-xs'>
                            {paymentLabel(payment)}
                          </p>
                        </div>
                        <strong className='text-lg tabular-nums'>
                          {money(payment.totalMinor, payment.currency)}
                        </strong>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
