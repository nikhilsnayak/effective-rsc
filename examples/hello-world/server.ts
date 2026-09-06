import { start } from 'effective-rsc/server';

await start({
  hostname: 'localhost',
  port: 18214,
  root: import.meta.dir,
});
