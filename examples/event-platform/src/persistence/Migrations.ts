import { SqliteMigrator } from '@effect/sql-sqlite-bun';

import Migration002 from '@/persistence/Migrations/002_EventPlatform';
import Migration003 from '@/persistence/Migrations/003_OrganizerStudio';
import Migration004 from '@/persistence/Migrations/004_Registration';
import Migration005 from '@/persistence/Migrations/005_AttendeeHub';
import Migration006 from '@/persistence/Migrations/006_CheckIn';
import Migration007 from '@/persistence/Migrations/007_ProgrammeManagement';
import Migration008 from '@/persistence/Migrations/008_Communications';
import Migration009 from '@/persistence/Migrations/009_OrderOperations';
import Migration010 from '@/persistence/Migrations/010_DiscountCodes';
import Migration011 from '@/persistence/Migrations/011_Waitlists';
import Migration012 from '@/persistence/Migrations/012_RegistrationQuestions';
import Migration013 from '@/persistence/Migrations/013_ReleaseHardening';

const loader = SqliteMigrator.fromRecord({
  '2_EventPlatform': Migration002,
  '3_OrganizerStudio': Migration003,
  '4_Registration': Migration004,
  '5_AttendeeHub': Migration005,
  '6_CheckIn': Migration006,
  '7_ProgrammeManagement': Migration007,
  '8_Communications': Migration008,
  '9_OrderOperations': Migration009,
  '10_DiscountCodes': Migration010,
  '11_Waitlists': Migration011,
  '12_RegistrationQuestions': Migration012,
  '13_ReleaseHardening': Migration013,
});

export const runMigrations = SqliteMigrator.run({ loader });
