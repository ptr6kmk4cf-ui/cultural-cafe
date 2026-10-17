// One "server instance" for scripts/rate-limit-check.mjs: hits a shared limit N times
// and prints how many requests it was allowed.
import { rateLimit } from '../src/lib/rate-limit';
import { db } from '../src/lib/db';

const [key, limit, windowMs, tries, mode] = process.argv.slice(2);
let allowed = 0;
let blocked = 0;
const one = async () => {
  try {
    await rateLimit(key, Number(limit), Number(windowMs));
    allowed++;
  } catch (e) {
    if ((e as { status?: number }).status === 429) blocked++;
    else throw e;
  }
};
if (mode === 'parallel') await Promise.all(Array.from({ length: Number(tries) }, one));
else for (let i = 0; i < Number(tries); i++) await one();
console.log(JSON.stringify({ allowed, blocked }));
await db.$disconnect();
