import { describe, expect, it } from '@effect/vitest';
import { DateTime } from 'effect';

import { formatAgendaCalendar } from '../../src/modules/agenda/calendar';
import { conference } from '../../src/modules/conference/data';
import type { AgendaItem } from '../../src/modules/conference/model';

const agenda = [
  {
    calendarDate: '2026-08-22',
    dayLabel: 'Saturday',
    endsAt: '10:15',
    id: 'server-components-from-first-principles',
    room: 'Auditorium',
    startsAt: '09:30',
    title: 'Server Components from first principles',
  },
  {
    calendarDate: '2026-08-23',
    dayLabel: 'Sunday',
    endsAt: '11:30',
    id: 'mutation-protocols-that-compose',
    room: 'Studio',
    startsAt: '10:45',
    title: 'Mutation protocols that compose',
  },
] satisfies ReadonlyArray<AgendaItem>;
const generatedAt = DateTime.makeUnsafe('2026-08-01T12:34:56Z');

describe('formatAgendaCalendar', () => {
  it('encodes the selected sessions as an iCalendar feed', () => {
    const calendar = formatAgendaCalendar({ agenda, conference, generatedAt });

    expect(calendar).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(calendar).toContain('TZID:Asia/Kolkata');
    expect(calendar).toContain('DTSTAMP:20260801T123456Z');
    expect(calendar).toContain(
      'DTSTART;TZID=Asia/Kolkata:20260822T093000\r\nDTEND;TZID=Asia/Kolkata:20260822T101500',
    );
    expect(calendar).toContain('SUMMARY:Mutation protocols that compose');
    expect(calendar).toContain('LOCATION:Bangalore International Centre\\, Bengaluru\\, India');
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('produces a valid empty calendar', () => {
    const calendar = formatAgendaCalendar({ agenda: [], conference, generatedAt });

    expect(calendar).not.toContain('BEGIN:VEVENT');
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
