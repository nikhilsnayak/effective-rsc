'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.
// oxlint-disable effecttsgo/crypto-random-uuid -- Browser-generated idempotency keys must not pull Effect into the client graph.

import { CheckCircle2, CreditCard, Ticket } from 'lucide-react';
import { useState, useTransition } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { RegistrationQuestion, TicketType } from '@/modules/registration/model';
import type { RegistrationState } from '@/modules/registration/server-functions';
import { registerAttendee } from '@/modules/registration/server-functions';

const price = (ticket: TicketType) =>
  new Intl.NumberFormat('en', {
    currency: ticket.currency,
    style: 'currency',
  }).format(ticket.priceMinor / 100);

export function RegistrationForm({
  eventId,
  questions,
  tickets,
}: {
  readonly eventId: string;
  readonly questions: ReadonlyArray<RegistrationQuestion>;
  readonly tickets: ReadonlyArray<TicketType>;
}) {
  // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- The browser owns this checkout-attempt key before invoking the Server Function.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<RegistrationState | null>(null);
  const [pending, startTransition] = useTransition();
  const firstAvailableTicket = tickets.find((ticket) => ticket.available > 0);

  if (state?.status === 'success') {
    return (
      <RevealTransition key='registration-success'>
        <section className='border-border rounded-xl border p-6' aria-labelledby='ticket-issued'>
          <CheckCircle2 aria-hidden='true' className='text-primary size-8' />
          <h2 id='ticket-issued' className='mt-4 text-2xl font-semibold tracking-[-0.02em]'>
            You’re registered
          </h2>
          <p className='text-muted-foreground mt-2 leading-7'>
            A ticket was issued to {state.receipt.buyerEmail}. The local adapter does not send real
            email.
          </p>
          <dl className='bg-muted mt-6 grid gap-3 rounded-lg p-4 text-sm'>
            {state.receipt.discountCode === null ? null : (
              <div>
                <dt className='text-muted-foreground text-xs'>Discount</dt>
                <dd className='mt-1 font-medium'>
                  {state.receipt.discountCode} saved{' '}
                  {new Intl.NumberFormat('en', {
                    currency: state.receipt.currency,
                    style: 'currency',
                  }).format(state.receipt.discountMinor / 100)}
                </dd>
              </div>
            )}
            <div>
              <dt className='text-muted-foreground text-xs'>Ticket code</dt>
              <dd className='mt-1 font-mono font-semibold'>{state.receipt.ticketCode}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>Order</dt>
              <dd className='mt-1 font-mono text-xs'>{state.receipt.orderId}</dd>
            </div>
          </dl>
          <a
            className='mt-5 inline-flex text-sm font-medium underline underline-offset-4'
            href={state.receipt.attendeeAccessPath}
          >
            Open your attendee hub
          </a>
        </section>
      </RevealTransition>
    );
  }

  return (
    <RevealTransition key='registration-form'>
      <form
        className='grid gap-7'
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set(
            'answers',
            JSON.stringify(
              questions.map((question) => {
                const value = formData.get(`question-${question.questionId}`);
                return {
                  answer: typeof value === 'string' ? value : '',
                  questionId: question.questionId,
                };
              }),
            ),
          );
          startTransition(async () => {
            const result = await registerAttendee(formData);
            startTransition(() => {
              setState(result);
              if (result.status === 'error') {
                // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- A known failed attempt receives a fresh browser-owned idempotency key.
                setIdempotencyKey(crypto.randomUUID());
              }
            });
          });
        }}
      >
        <input name='eventId' type='hidden' value={eventId} />
        <input name='idempotencyKey' type='hidden' value={idempotencyKey} />

        <FieldSet>
          <FieldLegend>Choose a ticket</FieldLegend>
          <RadioGroup
            defaultValue={firstAvailableTicket?.ticketTypeId}
            name='ticketTypeId'
            required
          >
            {tickets.map((ticket) => (
              <FieldLabel className='cursor-pointer' key={ticket.ticketTypeId}>
                <Field data-disabled={ticket.available === 0} orientation='horizontal'>
                  <FieldContent>
                    <FieldTitle>{ticket.name}</FieldTitle>
                    <FieldDescription>{ticket.description}</FieldDescription>
                    <FieldDescription>
                      {ticket.available > 0 ? `${ticket.available} remaining` : 'Sold out'}
                    </FieldDescription>
                  </FieldContent>
                  <span className='shrink-0 font-mono text-sm font-semibold'>{price(ticket)}</span>
                  <RadioGroupItem
                    aria-label={`Choose ${ticket.name}`}
                    disabled={ticket.available === 0}
                    id={`ticket-choice-${ticket.ticketTypeId}`}
                    value={ticket.ticketTypeId}
                  />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>

        {questions.length === 0 ? null : (
          <FieldSet>
            <FieldLegend>Registration questions</FieldLegend>
            <FieldDescription>
              These questions were configured by the event organizer.
            </FieldDescription>
            <FieldGroup>
              {questions.map((question) => (
                <Field key={question.questionId}>
                  <FieldLabel htmlFor={`question-${question.questionId}`}>
                    {question.label}
                    {question.required ? ' *' : ''}
                  </FieldLabel>
                  {question.questionType === 'select' ? (
                    <NativeSelect
                      className='w-full'
                      id={`question-${question.questionId}`}
                      name={`question-${question.questionId}`}
                      required={question.required}
                    >
                      <NativeSelectOption value=''>Choose an option</NativeSelectOption>
                      {question.options.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                          {option}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={`question-${question.questionId}`}
                      maxLength={500}
                      name={`question-${question.questionId}`}
                      required={question.required}
                    />
                  )}
                  {question.description.length > 0 ? (
                    <FieldDescription>{question.description}</FieldDescription>
                  ) : null}
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        )}

        <FieldSet>
          <FieldLegend>Attendee details</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='buyer-name'>Name</FieldLabel>
              <Input
                autoComplete='name'
                id='buyer-name'
                maxLength={100}
                name='buyerName'
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='buyer-email'>Email</FieldLabel>
              <Input
                autoComplete='email'
                id='buyer-email'
                maxLength={254}
                name='buyerEmail'
                required
                type='email'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='discount-code'>Discount code</FieldLabel>
              <Input
                autoComplete='off'
                id='discount-code'
                maxLength={40}
                name='discountCode'
                placeholder='Optional'
              />
              <FieldDescription>Try COMMUNITY20 for this demonstration event.</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Local payment outcome</FieldLegend>
          <FieldDescription>
            This deterministic adapter never contacts a payment provider.
          </FieldDescription>
          <RadioGroup defaultValue='approve' name='paymentMethod' required>
            <FieldLabel>
              <Field orientation='horizontal'>
                <RadioGroupItem id='payment-outcome-approve' value='approve' />
                <FieldContent>
                  <FieldTitle>Approve payment</FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
            <FieldLabel>
              <Field orientation='horizontal'>
                <RadioGroupItem id='payment-outcome-decline' value='decline' />
                <FieldContent>
                  <FieldTitle>Decline payment</FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
          </RadioGroup>
        </FieldSet>

        {state?.status === 'error' ? (
          <RevealTransition>
            <p aria-live='polite' className='text-destructive text-sm'>
              {state.message}
            </p>
          </RevealTransition>
        ) : null}

        <Button disabled={pending || firstAvailableTicket === undefined} type='submit'>
          {pending ? null : <CreditCard aria-hidden='true' data-icon='inline-start' />}
          {pending ? 'Processing…' : 'Complete registration'}
        </Button>
        <p className='text-muted-foreground flex items-start gap-2 text-xs leading-5'>
          <Ticket aria-hidden='true' className='mt-0.5 size-3.5 shrink-0' />
          Demonstration checkout only. No money is charged and no email is sent.
        </p>
      </form>
    </RevealTransition>
  );
}
