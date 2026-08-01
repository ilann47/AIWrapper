# Operations

## Backups

Run `pg_dump --format=custom --file=aiwrapper.dump "$DATABASE_URL"` and back up the protected profile volume separately. Profile backups contain OAuth credentials: encrypt them, restrict ACLs and test restore procedures. Redis is disposable live state; PostgreSQL and profile homes are not.

## Windows service

Run the API and worker under a dedicated non-administrator account. Grant it read/write access only to the application directory and configured profile root. Use an NSSM/Windows Service wrapper with `node dist/apps/api/src/index.js` and `node dist/apps/worker/src/index.js`. Never invoke Codex through `cmd /c`; AIWrapper resolves the npm entrypoint directly.

## Linux

Install the official Codex CLI, authenticate each protected profile with `CODEX_HOME=/srv/aiwrapper/profiles/<profile> codex login`, and run the containers or systemd units as an unprivileged service account. Mount profile homes with mode 0700.

## Private access

Prefer Tailscale: expose the loopback reverse proxy with `tailscale serve --https=443 http://127.0.0.1:8088`. With Cloudflare Tunnel, enable Access identity policy and point the tunnel only at the reverse proxy. In both cases keep API bearer authentication enabled and configure an explicit CORS origin.

## Rotation and incidents

Rotate client keys with `POST /admin/users/:id/keys`, distribute the one-time secret, then revoke the old key with `DELETE /admin/keys/:id`. Rotate `API_KEY_PEPPER` through a dual-pepper migration because replacing it immediately invalidates every key. On suspected OAuth compromise, stop runtimes, revoke the session with the provider, replace the profile and audit all requests.
