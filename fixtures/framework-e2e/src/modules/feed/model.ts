export type FeedEntry = {
  readonly id: string;
  readonly category: string;
  readonly title: string;
};

export type FeedPage = {
  readonly entries: ReadonlyArray<FeedEntry>;
  readonly nextCursor: number | null;
  readonly total: number;
};
