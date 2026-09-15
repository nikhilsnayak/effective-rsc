'use server';

import { Effect, Schema, Stream } from 'effect';

import { ERSC } from './ersc';
import { PageInput } from './model';
import { FeedService } from './service';
import { renderStory, StoryNote } from './story-card';

export const getStoryNote = ERSC.ServerFn.make({
  input: Schema.Struct({ id: Schema.Natural }),
  handler: ({ id }) => Effect.succeed(<StoryNote id={id} />),
});

export const streamFeed = ERSC.ServerFn.make({
  input: PageInput,
  handler: Effect.fn('streamFeed')(function* ({ after }) {
    const feed = yield* FeedService;
    return feed.stream(after).pipe(Stream.map(renderStory), Stream.orDie);
  }),
});
