import { DateTime } from 'effect';

import type { AgendaItem, Conference } from '@/modules/conference/model';

type AgendaCalendarOptions = {
  readonly agenda: ReadonlyArray<AgendaItem>;
  readonly conference: Conference;
  readonly generatedAt: DateTime.Utc;
};

const escapeText = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');

const calendarTime = (date: string, time: string) =>
  `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;

const calendarTimestamp = (dateTime: DateTime.Utc) =>
  DateTime.formatIso(dateTime).replaceAll('-', '').replaceAll(':', '').replace('.000', '');

export function formatAgendaCalendar({ agenda, conference, generatedAt }: AgendaCalendarOptions) {
  const events = agenda.flatMap((item) => {
    const location = escapeText(`${item.room}, ${conference.venue}, ${conference.location}`);

    return [
      'BEGIN:VEVENT',
      `UID:effective-rsc-conf-${conference.year}-${item.id}@effective-rsc.dev`,
      `DTSTAMP:${calendarTimestamp(generatedAt)}`,
      `DTSTART;TZID=Asia/Kolkata:${calendarTime(item.calendarDate, item.startsAt)}`,
      `DTEND;TZID=Asia/Kolkata:${calendarTime(item.calendarDate, item.endsAt)}`,
      `SUMMARY:${escapeText(item.title)}`,
      `LOCATION:${location}`,
      'END:VEVENT',
    ];
  });

  return `${[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//effective-rsc Conf//Attendee Agenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`${conference.name} ${conference.year} agenda`)}`,
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')}\r\n`;
}
