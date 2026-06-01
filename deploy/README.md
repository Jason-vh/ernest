# exe.dev deployment — ernest

```text
https://ernest.vhtm.eu
```

Tiny static page hosted on the shared `vhtm-eu` VM. The arch and
conventions live in <https://github.com/Jason-vh/vhtm.eu>.

## Architecture

```text
client
  -> https://ernest.vhtm.eu
  -> exe.dev edge (TLS)
  -> vhtm-eu :8080 → Caddy → 127.0.0.1:3004
  -> Bun process serving index.html + /api/health
```

No database, no env vars, no secrets.

## Deploy

Every push to `main` runs on the self-hosted runner labeled
`ernest-prod`, builds the Docker image, brings up the container, and
reloads Caddy.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/ernest
docker compose logs -f app
curl http://localhost:3004/api/health
```
