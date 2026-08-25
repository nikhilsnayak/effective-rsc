import { Effect } from 'effect';

import { ERSC } from '@/ersc';
import { ConferenceRepository } from '@/modules/conference/conference-repository';

type SessionSpeakerProps = {
  readonly speakerId: string;
};

export const SessionSpeaker = ERSC.Component.make({
  render: Effect.fn('SessionSpeaker')(function* ({ speakerId }: SessionSpeakerProps) {
    const repository = yield* ConferenceRepository;
    const speaker = yield* repository.speaker(speakerId);

    return (
      <div
        className='mt-4 flex items-center gap-2 text-sm'
        data-speaker-completed-at={speaker.completedAt}
        data-speaker-id={speaker.data.id}
        data-speaker-started-at={speaker.startedAt}
      >
        <span className='font-medium'>{speaker.data.name}</span>
        <span aria-hidden='true' className='text-border'>
          /
        </span>
        <span className='text-muted-foreground'>{speaker.data.role}</span>
      </div>
    );
  }),
});
