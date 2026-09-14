'use server';

import { Effect, Stream } from 'effect';

import { ERSC } from './ersc';
import { PageInput } from './model';
import { FeedService } from './service';
import { renderStory } from './story-card';

export const streamFeed = ERSC.ServerFn.make({
  input: PageInput,
  handler: Effect.fn('streamFeed')(function* ({ after }) {
    const feed = yield* FeedService;
    return feed.stream(after).pipe(Stream.map(renderStory), Stream.orDie);
  }),
});
