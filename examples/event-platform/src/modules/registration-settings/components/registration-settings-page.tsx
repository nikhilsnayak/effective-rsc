import { Effect, Schema } from 'effect';
import { ArrowLeft, ClipboardList, ShieldCheck } from 'lucide-react';
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
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import {
  ArchiveRegistrationQuestion,
  CreateRegistrationQuestion,
} from '@/modules/registration-settings/components/registration-question-actions';
import { RegistrationSettingsAccessDenied } from '@/modules/registration-settings/model';
import { RegistrationSettingsService } from '@/modules/registration-settings/service';

export const RegistrationSettingsPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('RegistrationSettingsPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* RegistrationSettingsService;
    const workspace = yield* service
      .workspace(userId, params.eventId)
      .pipe(
        Effect.catchIf(Schema.is(RegistrationSettingsAccessDenied), () => Effect.succeed(null)),
      );
    if (workspace === null) {
      return (
        <NavigationTransition>
          <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
            <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
            <h1 className='mt-4 text-3xl font-semibold'>Registration access required</h1>
            <p className='text-muted-foreground mt-3'>
              Your organizer role cannot configure registration.
            </p>
          </main>
        </NavigationTransition>
      );
    }

    const activeQuestions = workspace.questions.filter((question) => question.status === 'active');

    return (
      <NavigationTransition key={`registration-settings-${workspace.event.eventId}`}>
        <main className='mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14'>
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
              {workspace.event.eventName} registration
            </h1>
            <p className='text-muted-foreground mt-3'>
              Add questions that are validated and recorded with each new order.
            </p>
          </header>
          <div className='grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]'>
            <section aria-labelledby='questions-heading'>
              <div className='flex items-center justify-between gap-4'>
                <h2 className='text-2xl font-semibold' id='questions-heading'>
                  Active questions
                </h2>
                <span className='text-muted-foreground text-sm'>{activeQuestions.length}</span>
              </div>
              {activeQuestions.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <ClipboardList aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No custom questions</EmptyTitle>
                    <EmptyDescription>Checkout collects only attendee identity.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='mt-5 grid gap-4'>
                  {activeQuestions.map((question) => (
                    <ViewTransition
                      default='none'
                      enter='reveal-in'
                      exit='reveal-out'
                      key={question.questionId}
                      update='auto'
                    >
                      <Card>
                        <CardHeader>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge variant='outline'>{question.questionType}</Badge>
                            <Badge variant='secondary'>
                              {question.required ? 'required' : 'optional'}
                            </Badge>
                          </div>
                          <CardTitle className='mt-3'>{question.label}</CardTitle>
                        </CardHeader>
                        <CardContent className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
                          <div className='text-muted-foreground grid gap-2 text-sm'>
                            {question.description ? <p>{question.description}</p> : null}
                            {question.options.length > 0 ? (
                              <p>{question.options.join(' · ')}</p>
                            ) : null}
                          </div>
                          <ArchiveRegistrationQuestion
                            eventId={workspace.event.eventId}
                            questionId={question.questionId}
                          />
                        </CardContent>
                      </Card>
                    </ViewTransition>
                  ))}
                </div>
              )}
            </section>
            <aside className='border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8'>
              <h2 className='text-xl font-semibold'>Add a question</h2>
              <p className='text-muted-foreground mt-2 mb-6 text-sm leading-6'>
                Existing answers remain attached to their orders when a question is archived.
              </p>
              <CreateRegistrationQuestion eventId={workspace.event.eventId} />
            </aside>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
