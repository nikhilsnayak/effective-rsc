import { Schema } from 'effect';
import type { ReactNode } from 'react';

export const PageSize = 6;
export const PageInput = Schema.Struct({ after: Schema.Natural });

export interface FeedItem {
  readonly id: number;
  readonly content: ReactNode;
}

export interface FeedPage {
  readonly items: ReadonlyArray<FeedItem>;
  readonly total: number;
}
