import { Application } from 'effective-rsc';

import type { ConferenceService } from '@/modules/conference/service';

export const ERSC = Application.ersc<ConferenceService>();
