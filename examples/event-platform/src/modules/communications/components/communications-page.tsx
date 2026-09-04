import { DateTime, Effect, Schema } from 'effect';
import { ArrowLeft, MailCheck, Megaphone, ShieldCheck, Users } from 'lucide-react';
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
import {
  AnnouncementComposer,
  SendAnnouncementButton,
} from '@/modules/communications/components/announcement-actions';
import type { AnnouncementAudience } from '@/modules/communications/model';
import { CommunicationsAccessDenied } from '@/modules/communications/model';
import { CommunicationsService } from '@/modules/communications/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const audienceLabel = (audience: AnnouncementAudience) => {
  switch (audience) {
    case 'all_attendees':
      return 'All attendees';
    case 'checked_in':
      return 'Checked in';
    case 'not_checked_in':
      return 'Not checked in';
  }
};

const sentDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    dateStyle: 'medium',
    locale: 'en',
    timeStyle: 'short',
  });

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>
          Communications access required
        </h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          Announcements are available to event managers and organization administrators.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const CommunicationsPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('CommunicationsPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* CommunicationsService;
    const workspace = yield* service
      .workspace(userId, params.eventId)
      .pipe(Effect.catchIf(Schema.is(CommunicationsAccessDenied), () => Effect.succeed(null)));
    if (workspace === null) {
      return <AccessDenied />;
    }

    return (
      <NavigationTransition key={`communications-${workspace.event.eventId}`}>
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
              <Badge variant='outline'>{workspace.event.organizationName}</Badge>
              <Badge variant='secondary'>{workspace.event.status}</Badge>
            </div>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
              {workspace.event.eventName} communications
            </h1>
            <p className='text-muted-foreground mt-3 max-w-2xl leading-7'>
              Draft targeted attendee announcements, deliver them through the transactional outbox,
              and review their delivery state.
            </p>
          </header>

          <section className='grid gap-4 py-8 sm:grid-cols-3' aria-label='Audience availability'>
            <Card size='sm'>
              <CardContent>
                <Users aria-hidden='true' className='text-muted-foreground size-4' />
                <strong className='mt-3 block text-2xl tabular-nums'>
                  {workspace.event.allAttendees}
                </strong>
                <p className='text-muted-foreground text-xs'>active attendees</p>
              </CardContent>
            </Card>
            <Card size='sm'>
              <CardContent>
                <MailCheck aria-hidden='true' className='text-muted-foreground size-4' />
                <strong className='mt-3 block text-2xl tabular-nums'>
                  {workspace.event.checkedInAttendees}
                </strong>
                <p className='text-muted-foreground text-xs'>checked in</p>
              </CardContent>
            </Card>
            <Card size='sm'>
              <CardContent>
                <Megaphone aria-hidden='true' className='text-muted-foreground size-4' />
                <strong className='mt-3 block text-2xl tabular-nums'>
                  {workspace.event.notCheckedInAttendees}
                </strong>
                <p className='text-muted-foreground text-xs'>not checked in</p>
              </CardContent>
            </Card>
          </section>

          <div className='grid gap-10 border-t py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
            <section aria-labelledby='compose-announcement-heading'>
              <h2 className='text-2xl font-semibold' id='compose-announcement-heading'>
                Compose announcement
              </h2>
              <p className='text-muted-foreground mt-2 mb-6 text-sm leading-6'>
                Saving creates a private draft. Review its audience before sending.
              </p>
              <AnnouncementComposer eventId={workspace.event.eventId} />
            </section>

            <section aria-labelledby='announcement-history-heading'>
              <h2 className='text-2xl font-semibold' id='announcement-history-heading'>
                Announcement history
              </h2>
              {workspace.announcements.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <Megaphone aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No announcements yet</EmptyTitle>
                    <EmptyDescription>Saved drafts and sent messages appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='mt-5 grid gap-4'>
                  {workspace.announcements.map((announcement) => (
                    <ViewTransition
                      default='none'
                      enter='reveal-in'
                      exit='reveal-out'
                      key={announcement.announcementId}
                      update='auto'
                    >
                      <Card>
                        <CardHeader>
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <Badge variant={announcement.status === 'sent' ? 'default' : 'outline'}>
                              {announcement.status}
                            </Badge>
                            <Badge variant='secondary'>
                              {audienceLabel(announcement.audience)}
                            </Badge>
                          </div>
                          <CardTitle className='mt-3'>{announcement.subject}</CardTitle>
                        </CardHeader>
                        <CardContent className='grid gap-4'>
                          <p className='text-muted-foreground text-sm leading-6 whitespace-pre-wrap'>
                            {announcement.body}
                          </p>
                          {announcement.status === 'draft' ? (
                            <SendAnnouncementButton
                              announcementId={announcement.announcementId}
                              eventId={workspace.event.eventId}
                            />
                          ) : (
                            <div className='grid gap-3'>
                              <div className='text-muted-foreground flex flex-wrap justify-between gap-2 text-xs'>
                                <span>
                                  {announcement.deliveredCount} delivered ·{' '}
                                  {announcement.pendingCount} pending
                                </span>
                                <span>
                                  {announcement.sentAt ? sentDate(announcement.sentAt) : null}
                                </span>
                              </div>
                              {announcement.pendingCount > 0 ? (
                                <SendAnnouncementButton
                                  announcementId={announcement.announcementId}
                                  eventId={workspace.event.eventId}
                                  retry
                                />
                              ) : null}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </ViewTransition>
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
