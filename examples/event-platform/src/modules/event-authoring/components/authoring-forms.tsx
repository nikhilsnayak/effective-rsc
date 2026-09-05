'use client';

import { Eye, EyeOff, Save, Ticket, WandSparkles } from 'lucide-react';
import { type ReactNode, startTransition, useActionState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { EditableEvent, ManagedTicketType } from '@/modules/event-authoring/model';
import type { AuthoringMutationState } from '@/modules/event-authoring/server-functions';
import {
  createEvent,
  saveTicketType,
  setTicketTypeStatus,
  updateEvent,
} from '@/modules/event-authoring/server-functions';

const currencies = Intl.supportedValuesOf('currency');
const timezones = Intl.supportedValuesOf('timeZone');

function ControlField({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </Field>
  );
}

function MutationMessage({ state }: { readonly state: AuthoringMutationState | null }) {
  return state ? (
    <RevealTransition>
      <div
        aria-live='polite'
        className={
          state.status === 'error'
            ? 'text-destructive flex flex-wrap items-center gap-3 text-sm'
            : 'text-muted-foreground flex flex-wrap items-center gap-3 text-sm'
        }
      >
        <span>{state.message}</span>
        {state.status === 'success' && state.editPath !== null ? (
          <a
            className='text-foreground font-medium underline underline-offset-4'
            href={state.editPath}
          >
            Open event editor
          </a>
        ) : null}
      </div>
    </RevealTransition>
  ) : null;
}

function TimezoneField({ defaultValue }: { readonly defaultValue: string }) {
  return (
    <ControlField id='event-timezone' label='IANA timezone'>
      <Combobox defaultValue={defaultValue} items={timezones} name='timezone' required>
        <ComboboxInput
          autoComplete='off'
          className='font-mono'
          id='event-timezone'
          placeholder='Search timezones…'
        />
        <ComboboxContent>
          <ComboboxEmpty>No matching timezone.</ComboboxEmpty>
          <ComboboxList>
            {(timezone) => (
              <ComboboxItem key={timezone} value={timezone}>
                {timezone}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </ControlField>
  );
}

export function EventDetailsForm({
  defaults,
  organizationId,
}: {
  readonly defaults?: EditableEvent;
  readonly organizationId: string;
}) {
  const editing = defaults !== undefined;
  const [state, submit, pending] = useActionState(editing ? updateEvent : createEvent, null);

  return (
    <form
      className='grid gap-7'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit(formData));
      }}
    >
      {editing ? (
        <>
          <input name='eventId' type='hidden' value={defaults.eventId} />
          <input name='expectedUpdatedAt' type='hidden' value={defaults.updatedAt} />
        </>
      ) : (
        <input name='organizationId' type='hidden' value={organizationId} />
      )}

      <FieldSet>
        <FieldLegend>Public identity</FieldLegend>
        <FieldGroup>
          <ControlField id='event-name' label='Event name'>
            <Input
              defaultValue={defaults?.name}
              id='event-name'
              maxLength={120}
              name='name'
              required
            />
          </ControlField>
          <ControlField id='event-slug' label='URL slug'>
            <Input
              className='font-mono'
              defaultValue={defaults?.eventSlug}
              id='event-slug'
              maxLength={80}
              minLength={2}
              name='eventSlug'
              pattern='[a-z0-9]+(?:-[a-z0-9]+)*'
              placeholder='typed-effects-summit-2027'
              required
            />
          </ControlField>
          <ControlField id='event-tagline' label='Tagline'>
            <Input
              defaultValue={defaults?.tagline}
              id='event-tagline'
              maxLength={180}
              name='tagline'
              required
            />
          </ControlField>
          <ControlField id='event-description' label='Description'>
            <Textarea
              className='min-h-24'
              defaultValue={defaults?.description}
              id='event-description'
              maxLength={2_000}
              name='description'
              required
            />
          </ControlField>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Schedule and venue</FieldLegend>
        <FieldGroup>
          <div className='grid gap-4 sm:grid-cols-2'>
            <ControlField id='event-starts-at' label='Starts'>
              <Input
                defaultValue={defaults?.startsAt}
                id='event-starts-at'
                name='startsAt'
                required
                type='datetime-local'
              />
            </ControlField>
            <ControlField id='event-ends-at' label='Ends'>
              <Input
                defaultValue={defaults?.endsAt}
                id='event-ends-at'
                name='endsAt'
                required
                type='datetime-local'
              />
            </ControlField>
          </div>
          <TimezoneField defaultValue={defaults?.timezone ?? 'Asia/Kolkata'} />
          <div className='grid gap-4 sm:grid-cols-2'>
            <ControlField id='event-venue' label='Venue'>
              <Input
                defaultValue={defaults?.venueName}
                id='event-venue'
                maxLength={160}
                name='venueName'
                required
              />
            </ControlField>
            <ControlField id='event-locality' label='City or locality'>
              <Input
                defaultValue={defaults?.locality}
                id='event-locality'
                maxLength={100}
                name='locality'
                required
              />
            </ControlField>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <ControlField id='event-country' label='Country code'>
              <Input
                className='uppercase'
                defaultValue={defaults?.countryCode ?? 'IN'}
                id='event-country'
                maxLength={2}
                minLength={2}
                name='countryCode'
                pattern='[A-Z]{2}'
                required
              />
            </ControlField>
            <ControlField id='event-capacity' label='Event capacity'>
              <Input
                defaultValue={defaults?.capacity ?? 100}
                id='event-capacity'
                min={1}
                name='capacity'
                required
                type='number'
              />
            </ControlField>
          </div>
        </FieldGroup>
      </FieldSet>

      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} type='submit'>
          {editing ? (
            <Save aria-hidden='true' data-icon='inline-start' />
          ) : (
            <WandSparkles aria-hidden='true' data-icon='inline-start' />
          )}
          {pending ? 'Saving…' : editing ? 'Save event' : 'Create draft event'}
        </Button>
        <MutationMessage state={state} />
      </div>
    </form>
  );
}

type TicketTypeAction =
  | { readonly _tag: 'Save'; readonly form: FormData }
  | { readonly _tag: 'SetStatus'; readonly input: Parameters<typeof setTicketTypeStatus>[0] };

export function TicketTypeForm({
  eventId,
  ticket,
}: {
  readonly eventId: string;
  readonly ticket?: ManagedTicketType;
}) {
  const [state, submit, pending] = useActionState<AuthoringMutationState | null, TicketTypeAction>(
    (previousState, action) =>
      action._tag === 'Save'
        ? saveTicketType(previousState, action.form)
        : setTicketTypeStatus(action.input),
    null,
  );
  const fieldPrefix = ticket?.ticketTypeId ?? 'new-ticket';
  const fieldId = (name: string) => `${fieldPrefix}-${name}`;

  return (
    <form
      className='border-border grid gap-4 rounded-xl border p-5'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit({ _tag: 'Save', form: formData }));
      }}
    >
      <input name='eventId' type='hidden' value={eventId} />
      {ticket ? <input name='ticketTypeId' type='hidden' value={ticket.ticketTypeId} /> : null}
      <div className='flex items-center justify-between gap-3'>
        <h3 className='inline-flex items-center gap-2 font-semibold'>
          <Ticket aria-hidden='true' className='size-4' />
          {ticket?.name ?? 'New ticket type'}
        </h3>
        {ticket ? (
          <span className='text-muted-foreground text-xs'>
            {ticket.quantitySold} sold · {ticket.quantityReserved} reserved
          </span>
        ) : null}
      </div>

      <FieldGroup>
        <ControlField id={fieldId('name')} label='Name'>
          <Input
            defaultValue={ticket?.name}
            id={fieldId('name')}
            maxLength={80}
            name='name'
            required
          />
        </ControlField>
        <ControlField id={fieldId('description')} label='Description'>
          <Textarea
            className='min-h-24'
            defaultValue={ticket?.description}
            id={fieldId('description')}
            maxLength={500}
            name='description'
            required
          />
        </ControlField>
        <div className='grid gap-4 sm:grid-cols-3'>
          <ControlField id={fieldId('price')} label='Price in minor units'>
            <Input
              defaultValue={ticket?.priceMinor ?? 0}
              id={fieldId('price')}
              min={0}
              name='priceMinor'
              required
              type='number'
            />
          </ControlField>
          <ControlField id={fieldId('currency')} label='Currency'>
            <NativeSelect
              className='w-full'
              defaultValue={ticket?.currency ?? 'INR'}
              id={fieldId('currency')}
              name='currency'
              required
            >
              {currencies.map((currency) => (
                <NativeSelectOption key={currency} value={currency}>
                  {currency}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </ControlField>
          <ControlField id={fieldId('quantity')} label='Quantity'>
            <Input
              defaultValue={ticket?.quantityTotal ?? 100}
              id={fieldId('quantity')}
              min={1}
              name='quantityTotal'
              required
              type='number'
            />
          </ControlField>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <ControlField id={fieldId('sales-start')} label='Sales start'>
            <Input
              defaultValue={ticket?.salesStartsAt}
              id={fieldId('sales-start')}
              name='salesStartsAt'
              required
              type='datetime-local'
            />
          </ControlField>
          <ControlField id={fieldId('sales-end')} label='Sales end'>
            <Input
              defaultValue={ticket?.salesEndsAt}
              id={fieldId('sales-end')}
              name='salesEndsAt'
              required
              type='datetime-local'
            />
          </ControlField>
        </div>
      </FieldGroup>

      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} size='sm' type='submit' variant='outline'>
          <Save aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Saving…' : ticket ? 'Save ticket' : 'Add ticket'}
        </Button>
        {ticket ? (
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(() =>
                submit({
                  _tag: 'SetStatus',
                  input: {
                    eventId,
                    status: ticket.status === 'active' ? 'hidden' : 'active',
                    ticketTypeId: ticket.ticketTypeId,
                  },
                }),
              );
            }}
            size='sm'
            type='button'
            variant='ghost'
          >
            {ticket.status === 'active' ? (
              <EyeOff aria-hidden='true' data-icon='inline-start' />
            ) : (
              <Eye aria-hidden='true' data-icon='inline-start' />
            )}
            {ticket.status === 'active' ? 'Hide from sale' : 'Put on sale'}
          </Button>
        ) : null}
        <MutationMessage state={state} />
      </div>
    </form>
  );
}
