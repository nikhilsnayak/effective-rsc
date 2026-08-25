import { Application } from 'effective-rsc';

import type { ConferenceRepository } from '@/modules/conference/conference-repository';

export const ERSC = Application.ersc<ConferenceRepository>();
