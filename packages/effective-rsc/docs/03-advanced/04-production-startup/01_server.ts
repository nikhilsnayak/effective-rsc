/**
 * @title Server entry
 * Save this as `server.ts` in the application root and run it with `bun server.ts` after building.
 */
import { start } from 'effective-rsc/server';

await start({
  hostname: 'localhost',
  port: 18193,
  root: import.meta.dir,
});
