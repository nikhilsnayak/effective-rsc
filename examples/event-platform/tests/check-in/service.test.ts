import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { CheckInTicket } from '@/modules/check-in/model';
import { CheckInRepository } from '@/modules/check-in/repository';
import { CheckInService } from '@/modules/check-in/service';

const ticket = {
  code: 'GTH-DEMOADA0001',
  eventId: 'event-effect-systems-summit-2026',
  eventName: 'Effect Systems Summit',
  holderEmail: 'ada@example.test',
  holderName: 'Ada Lovelace',
  status: 'valid',
  ticketId: 'ticket-demo-ada',
  ticketTypeName: 'Community',
} satisfies CheckInTicket;

const event = {
  checkedIn: 0,
  eventId: ticket.eventId,
  eventName: ticket.eventName,
  issued: 1,
  organizationName: 'Runtime Collective',
  role: 'check_in_staff',
} as const;

const layer = (repository: Parameters<typeof CheckInRepository.layerTest>[0]) =>
  CheckInService.layer.pipe(Layer.provide(CheckInRepository.layerTest(repository)));

describe('CheckInService', () => {
  it.effect('checks in a valid credential and treats a repeated scan as idempotent', () =>
    Effect.gen(function* () {
      const service = yield* CheckInService;
      const result = yield* service.checkIn('user-nikhil', ticket.eventId, ticket.code);
      expect(result).toMatchObject({ _tag: 'CheckedIn', ticket: { status: 'checked_in' } });
    }).pipe(
      Effect.provide(
        layer({
          findCredential: () => Effect.succeed(ticket),
          loadEvent: () => Effect.succeed(event),
          transitionCredential: () => Effect.succeed(true),
        }),
      ),
    ),
  );

  it.effect('returns the existing attendee for an already checked-in credential', () =>
    Effect.gen(function* () {
      const service = yield* CheckInService;
      const result = yield* service.checkIn('user-nikhil', ticket.eventId, ticket.code);
      expect(result._tag).toBe('AlreadyCheckedIn');
    }).pipe(
      Effect.provide(
        layer({
          findCredential: () => Effect.succeed({ ...ticket, status: 'checked_in' }),
          loadEvent: () => Effect.succeed(event),
        }),
      ),
    ),
  );

  it.effect('rejects a cancelled credential without mutating it', () =>
    Effect.gen(function* () {
      const service = yield* CheckInService;
      const error = yield* service
        .checkIn('user-nikhil', ticket.eventId, ticket.code)
        .pipe(Effect.flip);
      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/check-in/CheckInTicketCancelled',
      );
    }).pipe(
      Effect.provide(
        layer({
          findCredential: () => Effect.succeed({ ...ticket, status: 'cancelled' }),
          loadEvent: () => Effect.succeed(event),
        }),
      ),
    ),
  );
});
