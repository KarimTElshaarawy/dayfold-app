import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The planner (shared/) is copied from the Dayfold web repo. To pick up planner fixes, check that repo out
 * somewhere and run: npm run sync:shared -- ../study-planner
 */
const src = process.argv[2];
if (!src || !existsSync(resolve(src, 'shared/planner'))) {
  console.error('Usage: npm run sync:shared -- <path to the Dayfold web repo checkout>');
  process.exit(1);
}
for (const f of ['types.ts', 'time.ts', 'defaults.ts', 'seed.ts', 'palette.ts']) cpSync(resolve(src, 'shared', f), resolve('shared', f));
cpSync(resolve(src, 'shared/planner'), resolve('shared/planner'), { recursive: true });
console.log('shared/ updated. Run npm test.');
