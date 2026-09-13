import { Application } from 'effective-rsc';

import type { FeedService } from '@/modules/feed/service';
import type { FixtureService } from '@/modules/fixture/service';

export const ERSC = Application.ersc<FeedService | FixtureService>();
