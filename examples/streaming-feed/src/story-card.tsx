import { Effect } from 'effect';

import { ERSC } from './ersc';
import { FeedService, type Story } from './service';
import { StoryDetails } from './story-details';

const StoryNote = ERSC.Component.make({
  render: Effect.fn('StoryNote')(function* ({ id }: { readonly id: number }) {
    const feed = yield* FeedService;
    const detail = yield* feed.detail(id);
    return <p>{detail ?? 'This note is no longer available.'}</p>;
  }),
});

export function StoryCard({ story }: { readonly story: Story }) {
  return (
    <article className='story-card' data-story-id={story.id}>
      <span className='story-number'>{String(story.id).padStart(2, '0')}</span>
      <div className='story-content'>
        <div className='story-byline'>
          <span className='category'>{story.category}</span>
          <span aria-hidden='true'>/</span>
          <span>{story.author}</span>
        </div>
        <h2>{story.title}</h2>
        <p className='story-summary'>{story.summary}</p>
        <StoryDetails>
          <StoryNote id={story.id} />
        </StoryDetails>
      </div>
    </article>
  );
}

export const renderStory = (story: Story) => ({
  id: story.id,
  content: <StoryCard story={story} />,
});
