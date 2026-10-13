# Multi-endpoint OxiDNS WebUI

This frontend manages multiple OxiDNS instances using their existing management
APIs. The React/Next.js stack and DNS backend are unchanged. The compact instance
cards and connection switcher take UX inspiration from Zashboard; its source is
not copied into this project.

Use **Endpoints** to add, edit, test, or delete connections. Give each endpoint a
name and API URL, for example `https://dns.example.com/api` or a same-origin
reverse-proxy path such as `/router/api`. A bare HTTP(S) host URL adds `/api`.
Configure Basic authentication per endpoint when required. The existing OxiDNS
CORS settings must permit the dashboard's origin for cross-origin connections.

The header switcher changes the active instance without reloading the browser.
It closes prior requests and SSE streams, reloads configuration, health, build,
system and metrics, and reconnects visible Logs or a live Query Recorder. The
plugin detail sheet also has a switcher. Unsaved configuration edits prompt
before a switch; active save, reload, restart and upgrade operations block it.

**Instances** checks all endpoints independently, even if the active connection
is offline. Each card shows its own status, version, uptime, plugin count and
response time. An authentication failure or offline instance does not affect
other cards or the active connection.

Connections live in this browser's `oxidns-auth` storage entry. Legacy single
server settings migrate automatically. **Remember endpoint passwords** controls
whether passwords are stored across visits; with it off, passwords remain only
in the current session. Query Recorder, cache tools, providers, config editing,
metrics, logs and system controls continue to use the selected endpoint.

Run development and checks from this directory using the scripts in
`package.json`: `pnpm dev`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and
`pnpm build`. Production builds export static files into `out/`, which can be
served by OxiDNS or an independent static host. Google font downloads require
access to `fonts.googleapis.com` and `fonts.gstatic.com` during the build.
