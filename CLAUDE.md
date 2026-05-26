# CLAUDE.md

Ernest is retired. The map app he was — Bun monorepo, Vue + Hono, Funda scraper, Postgres + Drizzle, Telegram pings, the lot — lives in git history (search commits before 2026-05-26).

What's deployed now is a single static obituary page:

- `index.html` — self-contained HTML/CSS, no build step
- `server.ts` — tiny Bun.serve() that returns it on `$PORT`, plus `/api/health` for Railway

```sh
bun install
bun run dev      # hot-reload on :3000
bun run start    # production
```

Railway config (`railway.toml`) is one web service. The cron service and Postgres database on Railway need manual deletion from the dashboard — they're no longer referenced in code.
