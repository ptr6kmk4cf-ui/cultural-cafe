# Cultural Café

For one hour you write to an adult in another country, in your own language. They read a live translation.

This repo is the Conversa AI product, renamed and re-fronted as **Cultural Café**. The café (the old “World” hour) is the product. The dating-site assistant is still here as a side tool.

> **Status:** working MVP, tested end-to-end against a **local fictional demo dating site** only. No real dating platform is integrated. AI has been exercised with the offline mock provider; real-provider output quality is untested until you add an API key.

## What it is

- **The Café** — opt-in, one-hour conversations with someone in another city or country. Random match or pick a face. Both people accept. Chat is WebRTC peer-to-peer: the two browsers send the words; the server only sets the call up and translates a line when you hit send. The chat is not stored.
- **Live translation** — each person writes as they speak. The other sees a translation; the original is one tap away.
- **Safety defaults** — adults only, mutual accept, block/report, no phone/email/location shared by default.
- **Dating assistant (optional)** — Chrome extension panel next to supported sites: match screening, openers, replies, memory, private photos. Autopilot only on the local demo site.

## Repository layout

```
apps/web          Next.js 15 dashboard + REST API (Prisma/PostgreSQL, all AI calls server-side)
apps/extension    Chrome MV3 extension (React panel in Shadow DOM, esbuild)
apps/demo-site    "Amora" — local fictional dating site used to test the assistant
packages/shared   Types, language/style lists and the platform registry
scripts/          dev database, API smoke test, extension E2E test, UI screenshot check
```

Internal package names are still `@conversa/*` so imports and the database keep working. User-facing name is Cultural Café.

## Setup

Requirements: Node ≥ 20, macOS/Linux. No Docker needed (an embedded PostgreSQL is included).

```bash
npm install
cp apps/web/.env.example apps/web/.env
# set ENCRYPTION_KEY:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# AI is hardcoded to Claude Sonnet. Set an Anthropic AI_API_KEY, or the Neon AI Gateway vars.

npm run db:start      # embedded PostgreSQL on :5433 (keep running; data in .data/pg)
npm run db:push       # create tables
npm run db:seed       # demo@conversa.local (+ ADMIN_EMAIL admin); prints generated passwords
npm run dev:web       # dashboard + API → http://localhost:3000
npm run dev:demo      # demo dating site → http://localhost:4000
npm run build:ext     # extension → apps/extension/dist
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`. Then open **Dashboard → Browser Extension → Connect**. Open http://localhost:4000 and click the café **C** button.

If Conversa AI is already running on this machine, it uses the same local Postgres port (`5433`). Use that database instead of starting a second one.

### Environment (`apps/web/.env`)

See `apps/web/.env.example`. Required: `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_URL`, `AI_PROVIDER`.

## Features kept from Conversa AI

Find Matches, openers, conversation engine, 89 languages, private photo library, memory, Autopilot on the demo site, billing hooks, admin, PWA install. Café conversations keep the same API routes (`/app/world`, `/api/world`) so existing sessions and tests still work.

## Testing

```bash
npm run typecheck
npm run test:unit
npm run test:api
npm run build:ext && npm run test:e2e
npm run test:world
```

## Production (`culturalcafe.online`)

The live origin is **https://culturalcafe.online**. The domain is at Porkbun and still shows their parking page until DNS points at the host.

1. Create a hosted Postgres (Neon or similar). Use the pooled URL as `DATABASE_URL` and the direct URL as `DIRECT_URL`.
2. Deploy this repo to [Vercel](https://vercel.com) (Next.js, install from the repo root). Set:
   - `APP_URL=https://culturalcafe.online`
   - `DATABASE_URL` / `DIRECT_URL`
   - `ENCRYPTION_KEY` (32-byte base64)
   - Anthropic `AI_API_KEY`, or `NEON_AI_GATEWAY_TOKEN` and `NEON_AI_GATEWAY_BASE_URL`. The model is Claude Sonnet and cannot be switched.
3. In Vercel → Project → Domains, add `culturalcafe.online` and `www.culturalcafe.online`.
4. In Porkbun DNS, remove the parking A records and add the records Vercel shows (usually an A record to `10.0.1.1` for the apex, and CNAME `www` → `cname.vercel-dns.com`).
5. Run `prisma db push` against `DIRECT_URL` once, then open https://culturalcafe.online.

## Not done yet

- Claude Sonnet is required. The offline mock and other models are refused.
- No real dating platforms integrated (by design until authorised).
- Privacy policy and terms are placeholders.
- Hosted group cafés from the earlier research note are not built; this is still 1:1 café hours with a surprise match.
