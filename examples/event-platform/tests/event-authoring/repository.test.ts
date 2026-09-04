import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Layer } from 'effect';

import type { CreateEventInput, TicketTypeInput } from '@/modules/event-authoring/model';
import { EventAuthoringRepository } from '@/modules/event-authoring/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = EventAuthoringRepository.layer.pipe(Layer.provide(PersistenceLayer));

const eventInput = {
  capacity: 120,
  countryCode: 'IN',
  description: 'A newly authored event.',
  endsAt: '2027-02-10T11:30:00.000Z',
  eventSlug: 'effect-operations-day',
  locality: 'Bengaluru',
  name: 'Effect Operations Day',
  organizationId: 'org-effective-rsc',
  startsAt: '2027-02-10T03:30:00.000Z',
  tagline: 'Typed operations in practice.',
  timezone: 'Asia/Kolkata',
  venueName: 'Bangalore International Centre',
} satisfies CreateEventInput;

describe('EventAuthoringRepository', () => {
  it.effect('creates and edits an organization-scoped event with ticket inventory', () =>
    Effect.gen(function* () {
      const repository = yield* EventAuthoringRepository;

      const staffOrganization = yield* repository.findOrganization(
        'user-nikhil',
        'org-runtime-collective',
      );
      const managedOrganization = yield* repository.findOrganization(
        'user-nikhil',
        eventInput.organizationId,
      );
      expect(staffOrganization).toBeNull();
      expect(managedOrganization).not.toBeNull();

      const eventId = yield* repository.createEvent(
        'user-nikhil',
        eventInput,
        '2026-09-04T00:00:00.000Z',
      );
      expect(eventId).not.toBeNull();
      if (eventId === null) {
        return;
      }
      const slugAvailable = yield* repository.isSlugAvailable(
        eventInput.organizationId,
        eventInput.eventSlug,
        null,
      );
      expect(slugAvailable).toBe(false);

      const editor = yield* repository.loadEditor('user-nikhil', eventId);
      expect(editor?.event.name).toBe(eventInput.name);
      expect(editor?.event.status).toBe('draft');

      const ticketInput = {
        currency: 'INR',
        description: 'Full day admission.',
        eventId,
        name: 'General admission',
        priceMinor: 9_900,
        quantityTotal: 100,
        salesEndsAt: '2027-02-09T18:29:00.000Z',
        salesStartsAt: '2026-09-03T18:30:00.000Z',
      } satisfies TicketTypeInput;
      const ticketTypeId = yield* repository.createTicketType('user-nikhil', ticketInput);
      expect(ticketTypeId).not.toBeNull();
      if (ticketTypeId === null) {
        return;
      }

      const overAllocated = yield* repository
        .createTicketType('user-nikhil', {
          ...ticketInput,
          name: 'Overflow admission',
          quantityTotal: 21,
        })
        .pipe(Effect.exit);
      expect(Exit.isFailure(overAllocated)).toBe(true);

      const ticketUpdated = yield* repository.updateTicketType('user-nikhil', {
        ...ticketInput,
        priceMinor: 11_900,
        ticketTypeId,
      });
      const ticketHidden = yield* repository.setTicketTypeStatus(
        'user-nikhil',
        eventId,
        ticketTypeId,
        'hidden',
      );
      expect(ticketUpdated).toBe(true);
      expect(ticketHidden).toBe(true);

      const withTicket = yield* repository.loadEditor('user-nikhil', eventId);
      expect(withTicket?.tickets).toHaveLength(1);
      expect(withTicket?.tickets[0]?.priceMinor).toBe(11_900);
      expect(withTicket?.tickets[0]?.status).toBe('hidden');

      const eventUpdated = yield* repository.updateEvent(
        'user-nikhil',
        eventId,
        { ...eventInput, name: 'Effect Operations Workshop' },
        '2026-09-04T00:00:00.000Z',
        '2026-09-04T01:00:00.000Z',
      );
      const staleUpdate = yield* repository.updateEvent(
        'user-nikhil',
        eventId,
        eventInput,
        '2026-09-04T00:00:00.000Z',
        '2026-09-04T02:00:00.000Z',
      );
      expect(eventUpdated).toBe(true);
      expect(staleUpdate).toBe(false);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
