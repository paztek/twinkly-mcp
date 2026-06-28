# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`twinkly-mcp` is a Model Context Protocol (MCP) server that exposes control of [Twinkly](https://www.twinkly.com/) smart lights to AI agents. It wraps the [`@twinklyjs/twinkly`](https://github.com/twinklyjs/twinklyjs) library and surfaces a curated, agent-friendly set of MCP tools.

> **Current state: Phase 8 complete (functionally done; only Phase 9 npm-publishing remains).** TypeScript toolchain + CI (Phase 0), the config layer (`src/config.ts`, 37 tests), the device manager (`src/twinkly/device-manager.ts` + `src/errors.ts`, 26 tests), the MCP bootstrap (`src/server.ts` + `src/index.ts` + `src/tools/` + `src/logger.ts`), the read tools (`src/twinkly/format.ts` + `src/tools/status.ts` + `discover_devices`), the control tools (`src/tools/power.ts` + `color.ts` + `effects.ts` + `movies.ts`), the safety layer (read-only / tool-group / admin gating via `src/tools/shared.ts` + gated `src/tools/device-admin.ts`), the optional extras (Streamable HTTP transport `src/transport/http.ts` + gated realtime `src/tools/realtime.ts`), and the docs + guarded real-device smoke test (`src/integration.test.ts`, `README.md`) are in place — **134 tests (1 skipped without hardware), ~98% coverage**. The server runs over **stdio or Streamable HTTP** (`TWINKLY_TRANSPORT=http`, `/mcp` on loopback) and exposes the full everyday surface (`list_devices`, `discover_devices`, `get_device_details`, `get_summary`, `get_state`, `set_power`, `set_mode`, `set_color`, `set_brightness`, `set_saturation`, `list_effects`, `set_effect`, `list_movies`, `set_movie`) plus the gated admin tools (`set_name`, `set_timer`, realtime `send_frame`), all filterable by `TWINKLY_READONLY` / `TWINKLY_TOOLS` / `TWINKLY_ALLOW_ADMIN`. Only Phase 9 (npm publish / frictionless install) remains. The plan below tracks the build — update the checkboxes as phases land.

## Underlying library: `@twinklyjs/twinkly` (v0.0.8)

- ESM, ships TypeScript types, Node + browser builds. Deps: `commander`, `env-paths`.
- **`TwinklyClient`** — `new TwinklyClient({ ip })`; auth (login → verify) is handled automatically; `getToken()` returns the cached token. One client = one device.
- **`LEDOperationMode`** enum: `off | color | demo | movie | rt | effect | playlist`.
- Key methods: `getDeviceDetails`, `getSummary`, `getDeviceName`/`setDeviceName`, `getStatus`, `getFWVersion`; `getLEDOperationMode`/`setLEDOperationMode`; `getLEDColor`/`setLEDColor` (RGB **or** HSV); `getLEDBrightness`/`setLEDBrightness`; `getLEDSaturation`/`setLEDSaturation`; `getLEDEffects`/`getCurrentLEDEffect`/`setCurrentLEDEffect`; movies (`getMovies`, `getCurrentMovie`, `setCurrentMovie`, …); playlists; `getTimer`/`setTimer`; layout/config; realtime (`sendRealtimeFrame`, standalone `sendFrame(ip, token, nodes)`); plus risky ops (firmware, WiFi/network, MQTT, mic, `resetLED`).
- **`discover(options?)`** → `Device[]` (`{ ip, port, deviceId }`) over UDP (Node-only).

Job of this server: expose a **curated subset** as MCP tools — not all ~50 methods 1:1.

## Key decisions

- **Language: TypeScript** (twinklyjs and the MCP SDK are TS-first; gives end-to-end types + zod-validated tool inputs). Requires switching `package.json` from plain JS to a TS build step.
- **Multi-device: device registry** — named devices from config/env + ad-hoc discovery, optional `device` param per tool, configurable default.

## Target architecture

```
src/
├── index.ts            # bin entry: parse args/env → start transport (stdio|http)
├── server.ts           # creates McpServer, registers tools, wires transport
├── config.ts           # zod-validated config: env + config file + CLI flags
├── transport/
│   └── http.ts         # Streamable HTTP transport, per-session /mcp endpoint
├── twinkly/
│   ├── device-manager.ts  # registry: name→TwinklyClient, lazy auth, discovery cache
│   └── format.ts          # normalize device responses for LLM-friendly output
├── tools/
│   ├── index.ts        # registerAllTools(ctx); each registrar self-gates
│   ├── shared.ts       # device arg, result envelopes, guard, group/write gating
│   ├── discovery.ts    # discover_devices, list_devices
│   ├── status.ts       # get_device_details, get_summary, get_state (read)
│   ├── power.ts        # set_power, set_mode
│   ├── color.ts        # set_color (rgb/hsv), set_brightness, set_saturation
│   ├── effects.ts      # list_effects, set_effect
│   ├── movies.ts       # list_movies, set_movie
│   ├── device-admin.ts # set_name, set_timer (admin-gated)
│   └── realtime.ts     # send_frame (UDP, admin-gated)
└── errors.ts           # map FetchError → structured MCP tool errors
```

**Layering rule:** tools never touch HTTP. They call the device manager, which owns clients, auth tokens, and multi-device resolution. Keeps each layer unit-testable.

## Configuration surface

| Knob | Env / flag | Purpose |
|------|-----------|---------|
| Devices | `TWINKLY_IP`, `TWINKLY_DEVICES` (JSON `name:ip` map), `--ip` | Static targets |
| Default device | `TWINKLY_DEFAULT_DEVICE` | Which device when a tool omits `device` |
| Auto-discovery | `TWINKLY_DISCOVERY=true` | Populate registry via UDP at startup |
| Transport | `--transport stdio\|http`, `--port` | stdio (default) or Streamable HTTP |
| Safe mode | `TWINKLY_READONLY=true` | Expose only read tools |
| Tool groups | `TWINKLY_TOOLS=power,color,...` | Enable/disable categories |
| Risky ops | `TWINKLY_ALLOW_ADMIN=true` | Gate firmware/network/reset/MQTT (off by default) |
| Timeouts/retries | `TWINKLY_TIMEOUT_MS` | Resilience |
| Log level | `TWINKLY_LOG_LEVEL` | Diagnostics to **stderr** (never stdout on stdio) |

## Implementation plan & progress

- [x] **Phase 0 — Setup.** ✅ Deps installed (`@modelcontextprotocol/sdk` ^1, `@twinklyjs/twinkly` ^0.0.8, `zod` ^3; dev: `typescript` ^5.6, `tsx`, `vitest` ^4 + `@vitest/coverage-v8`, `@types/node`). `tsconfig.json` (NodeNext, strict), `vitest.config.ts`, npm scripts (`build`/`dev`/`start`/`typecheck`/`test`/`test:coverage`), `bin: twinkly-mcp → dist/index.js`, `engines.node >=20`. GitHub Actions CI (`.github/workflows/ci.yml`) runs typecheck + build + coverage on Node 20/22/24. `npm audit`: 0 vulnerabilities. Toolchain verified: typecheck, build, and test all green.
- [x] **Phase 1 — Config layer.** ✅ `src/config.ts`: zod-validated config merging defaults ← file ← env ← CLI (precedence verified). Pure `parseConfig({ file, env, argv })` with all I/O injected; `loadConfig()` is the production wrapper (reads `process.env`/`argv` + optional JSON config file via `--config`/`TWINKLY_CONFIG`). Devices merge by name (last wins) from `TWINKLY_IP`, `TWINKLY_DEVICES` (JSON map), and repeatable `--device name=ip`. Fail-fast `ConfigError` with readable messages. 37 vitest cases, ~98% coverage.

  **Config notes for later phases:** exported `TOOL_GROUPS` (`discovery|status|power|color|effects|movies|admin`), `TRANSPORTS`, `LOG_LEVELS`, `IMPLICIT_DEVICE_NAME` (`"default"`). `TwinklyMcpConfig.tools` is `undefined` ⇒ all groups enabled. Device manager (Phase 2) consumes `config.devices` + `config.defaultDevice`.
- [x] **Phase 2 — Device manager.** ✅ `src/twinkly/device-manager.ts`: name→device registry seeded from config; one `TwinklyClient` per device created lazily and reused (so twinklyjs's cached auth token is reused across calls). `resolve(device?)` → live client, falling back to the configured `defaultDevice`, the sole device, or the implicit `default`; throws on unknown/ambiguous. `withDevice(device, fn)` is the single path tools use — it resolves then normalizes any failure via `errors.ts`. On-demand UDP discovery with a short-lived cache (`discoveryTtlMs`, default 60s) folds new devices into the registry under their `deviceId` (deduped by IP, name collisions disambiguated). `src/errors.ts`: `TwinklyError` with a small `TwinklyErrorCode` set (`device_not_found | no_device_specified | device_unreachable | device_request_failed | discovery_failed`) and `toTwinklyError` mapping `FetchError` → request-failed (w/ HTTP status), other `Error` → unreachable. All seams (client factory, `discover`, clock) injected for tests: 26 vitest cases (19 manager + 7 errors).

  **Notes for later phases:** tools should resolve devices **only** through `DeviceManager.withDevice` (never construct clients or call `discover` directly). `listDevices()` returns the serializable `DeviceInfo[]` (`name`, `ip`, `source`, `isDefault`) backing the `list_devices` tool. Phase 3 constructs the manager from `loadConfig()` and wires it into the server context.
- [x] **Phase 3 — MCP bootstrap (stdio).** ✅ `src/server.ts` `createServer({ config, deviceManager, logger })` builds the `McpServer` (name/version + `tools` capability + agent instructions) and registers tools via `src/tools/index.ts` `registerAllTools(ctx)`; it is transport-agnostic and unit-tested. `src/index.ts` is the bin entry: `loadConfig` (with `node:fs` `readFileSync` injected) → `DeviceManager` → `createServer` → `StdioServerTransport`; it rejects non-stdio transports and bad config with a fail-fast stderr message + exit 1 (HTTP is Phase 7). `src/tools/discovery.ts` registers the read-only, zero-arg `list_devices` tool (typed `outputSchema`, `readOnlyHint`) backed by `DeviceManager.listDevices()`. `src/logger.ts` is a leveled **stderr-only** logger (injectable sink) — stdout stays clean for JSON-RPC. Verified end-to-end against the built `dist/index.js` (initialize → tools/list → tools/call). 11 new vitest cases (74 total); coverage: server/tools 100%, logger 91%. **Milestone: connectable server. ✅**

  **Notes for later phases:** `ServerContext` (`src/server.ts`) is the shared `{ server, config, deviceManager, logger }` handed to every tool registrar — new tool groups add a `registerXTools(ctx)` module under `src/tools/` and a call in `registerAllTools`. `registerAllTools` is also where Phase 6 wiring lands (filter by `config.tools`, drop writes when `config.readonly`, gate `admin` behind `config.allowAdmin`). Zero-arg tools should **omit** `inputSchema` (declaring `{}` forces clients to send an `arguments` payload or get a validation error). `SERVER_VERSION` in `server.ts` is hardcoded — keep it in sync with `package.json`.
- [x] **Phase 4 — Read tools.** ✅ `src/twinkly/format.ts` normalizes raw twinklyjs responses into compact camelCase shapes (the zod raw shapes there are the single source of truth — reused as tool `outputSchema` and as the formatters' return types, so schema/data can't drift) and provides `assertOk` (Twinkly answers HTTP 200 with a non-1000 body code on logical failures). `src/tools/shared.ts` holds the cross-tool building blocks: the optional `device` argument, `jsonResult`/`textResult` envelopes, `guard` (turns a thrown `TwinklyError` into an MCP error result instead of a protocol exception), and `optional` (best-effort reads on older firmware). `src/tools/status.ts` registers `get_device_details`, `get_summary`, and composite `get_state` (mode + brightness + saturation + color, fanned out in parallel; color is best-effort since it needs firmware ≥ 2.7.1). `discover_devices` (active UDP scan, folds new devices into the registry) joins `list_devices` in `src/tools/discovery.ts`. `src/test-utils.ts` (`connectHarness`, excluded from coverage) spins up the real server over an in-memory transport with fake `TwinklyClient`s. 19 new vitest cases (93 total); coverage ~97%. Verified against built `dist/index.js`: tools/list shows all five.

  **Notes for later phases:** tools targeting a device declare `inputSchema: deviceArg` (optional `device`) and resolve through `deviceManager.withDevice(device, fn)`; they re-`resolve(device)` only to get the canonical device `name` for output labels. Because these tools declare an `inputSchema`, MCP clients must send an `arguments` object (use `{}` when omitting `device`) — zero-arg tools (`list_devices`) still omit `inputSchema` entirely. Write tools return `textResult` (no `outputSchema`); read tools return `jsonResult` with a matching `outputSchema`.
- [x] **Phase 5 — Control tools.** ✅ **Milestone: full everyday control.** `src/tools/power.ts` (`set_power` — on ⇒ movie mode, off ⇒ off; `set_mode` — any `LEDOperationMode`, `effect_id` passed only when mode is `effect`), `src/tools/color.ts` (`set_color` — exactly one of `{r,g,b}` 0–255 or `{h,s,v}` h 0–359/s,v 0–255, then switches to color mode so it's visible; `set_brightness` / `set_saturation` — absolute 0–100), `src/tools/effects.ts` (`list_effects`, `set_effect` — selects then switches to effect mode), `src/tools/movies.ts` (`list_movies`, `set_movie` — selects then switches to movie mode). Writes use `assertOk` on every device call (catches non-1000 body codes like 1104 "movie not set") and return `textResult`; "set then switch mode" pairs run inside one `withDevice`. Strict zod ranges; the "exactly one of rgb/hsv" rule that a flat input shape can't express is enforced in-handler via `invalidInput`. Playlists are reachable through `set_mode "playlist"`; dedicated playlist authoring is intentionally out of the everyday surface. 19 new vitest cases (112 total); coverage `src/tools` 100%, overall ~98%. Verified against built `dist`: tools/list shows all 14 tools.
- [x] **Phase 6 — Safety & flexibility.** ✅ Gating lives in `src/tools/shared.ts` as two pure predicates — `groupEnabled(config, group)` (honors the `config.tools` allow-list and the admin gate: the `admin` group is hidden unless `config.allowAdmin`) and `writesEnabled(config)` (false in read-only mode). Each `registerXTools(ctx)` self-gates: read-only-only groups (`status`) and always-safe groups (`discovery` — `discover_devices` doesn't mutate the device) check only `groupEnabled`; all-write groups (`power`, `color`, `admin`) bail on `!groupEnabled || !writesEnabled`; mixed groups (`effects`, `movies`) register the `list_*` read then guard the `set_*` write behind `writesEnabled`. New `src/tools/device-admin.ts` adds the gated `set_name` (≤32 chars) and `set_timer` (seconds-after-midnight on/off, −1 to disable; reuses the device's own `time_now` so its clock isn't reset). Server instructions in `src/server.ts` were rewritten as agent-tuned guidance (start with list_devices/get_state; set_color switches to color mode; tools may be absent under read-only / allow-list / admin config). 11 new vitest cases (123 total); coverage `src/tools` 100%, overall ~98%. Verified against built `dist`: default 14 tools, `TWINKLY_READONLY` → 7 reads, `TWINKLY_ALLOW_ADMIN` → 16, `TWINKLY_TOOLS=status` → 3. **The optional gated raw passthrough was intentionally NOT shipped** — an arbitrary method passthrough would re-expose exactly the risky firmware/network/MQTT/reset operations this server deliberately omits; revisit only behind its own explicit opt-in if a concrete need appears.

  **Notes for later phases:** new tool groups must self-gate via `groupEnabled` / `writesEnabled` (classify each tool as read vs. device-write; `discover_devices` counts as a read for read-only purposes). Phase 7's HTTP transport doesn't affect gating — it's purely transport. If a tool group is added, also extend `TOOL_GROUPS` in `config.ts`.
- [x] **Phase 7 — Optional extras.** ✅ `src/transport/http.ts` `startHttpTransport({ port, logger, createMcpServer })` hosts the server over the SDK's `StreamableHTTPServerTransport` on a single `/mcp` endpoint with per-session state: each client `initialize` mints a session id (`mcp-session-id` header) and gets its own `McpServer` from the `createMcpServer` factory, sharing the process-wide `DeviceManager`; POST routes to the session (or starts one), GET opens the SSE stream, DELETE terminates, and non-`/mcp` paths / bad methods / sessionless non-initialize POSTs get JSON errors (404/405/400). Binds to **loopback (127.0.0.1)** by default — the MCP endpoint is a local control plane, not a LAN service. `src/index.ts` branches on `config.transport`: `http` → `startHttpTransport`, else stdio (the old "HTTP not implemented" guard is gone). `src/tools/realtime.ts` adds `send_frame` — pushes one frame of per-LED `{r,g,b}` (0–255, ≤4096 nodes) over UDP via twinklyjs's standalone `sendFrame(ip, token, nodes)`, switching the device into `rt` mode first (which also warms the auth token the UDP sender needs). It's **admin-gated** (group `admin` + `writesEnabled`), so it's off by default and shares the gate with `set_name`/`set_timer`. 8 new vitest cases (131 total) incl. a real HTTP client↔server round-trip via `StreamableHTTPClientTransport`; coverage overall ~97%, `src/tools` 100%, `http.ts` ~89%. Verified against built `dist` with real `curl`: `TWINKLY_TRANSPORT=http` serves initialize → tools/list (14 tools) and 404s unknown paths.

  **Notes for later phases:** `send_frame` lives in the `admin` group (no separate `realtime` group was added, to avoid a default-on group), so `TWINKLY_TOOLS=admin` toggles it alongside the device-admin tools. The HTTP server has no host/path config knobs yet (loopback + `/mcp` hardcoded); add config if LAN exposure is ever needed. Realtime tests stub the standalone `sendFrame` via `vi.mock('@twinklyjs/twinkly', importOriginal)` partial mock (keeps `TwinklyClient`/`discover`/`FetchError` real).
- [x] **Phase 8 — Tests & docs.** ✅ Coverage was already ~97% (well past the 80% target); added the last small gaps (`logger.ts` default stderr sink + stackless-Error fallback) so it's 100% on the leaf modules. `src/integration.test.ts` is a **guarded real-device smoke test** — `describe.skipIf(!process.env.TWINKLY_IP)`, registers the server **read-only** and calls only `get_device_details` / `get_state`, so it never changes the user's lights and is skipped in CI (run with `TWINKLY_IP=… npx vitest run src/integration.test.ts`). `README.md` is finalized for end users: dropped the "not yet usable" banner, documented every tool (incl. the admin-gated trio), the full env-var surface (devices / transport / safety / diagnostics), and both stdio and Streamable HTTP client setups. This file's Commands section gained the integration-test invocation. 3 new vitest cases (134 total, 1 skipped without hardware); coverage ~98%.
- [ ] **Phase 9 — Frictionless install ("as easy as Notion").** Make adoption a copy-paste one-liner. Publish to npm so the server runs via `npx -y twinkly-mcp` (no clone/build) — verify the `bin` shebang + `dist/` ship correctly and `files`/`.npmignore` are scoped. Provide a single documented recipe, `claude mcp add twinkly -- npx -y twinkly-mcp`, plus ready-to-paste `.mcp.json` / `claude_desktop_config.json` snippets for the common clients (Claude Code, Claude Desktop, Cursor). List in discovery surfaces: the official MCP registry, awesome-mcp-servers, Smithery, etc. Optional `mcp-name:`/server manifest metadata so registries can auto-ingest. Smooth the device-config step (the one bit Notion's OAuth hides): zero-config UX via `TWINKLY_DISCOVERY` so a fresh install finds lights on the LAN with no env vars, and a clear first-run message when none are found. **Caveat: unlike Notion, this is a LAN device controller — a hosted/remote OAuth server doesn't fit (it must run on the user's network), so "easy" here means a zero-build local launch + auto-discovery, not a hosted endpoint.** **Milestone: install in under a minute from a single command.**

## Curated first tools (not exhaustive)

`discover_devices`, `list_devices`, `get_state`, `set_power`, `set_mode`, `set_color`, `set_brightness`, `set_effect`, `set_movie` — ~90% of "make my lights do X". Everything else stays behind flags.

## Commands

- `npm run dev` — run the server in watch mode (`tsx watch src/index.ts`)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the built server (`node dist/index.js`)
- `npm run typecheck` — type-check without emitting
- `npm test` — run the vitest suite once
- `npm run test:watch` — vitest in watch mode
- `npm run test:coverage` — run tests with v8 coverage
- Single test file: `npx vitest run src/config.test.ts`
- Single test by name: `npx vitest run -t "merges env over file"`
- Real-device smoke test (read-only; skipped unless `TWINKLY_IP` is set): `TWINKLY_IP=192.168.1.50 npx vitest run src/integration.test.ts`
- Run over HTTP locally: `TWINKLY_IP=192.168.1.50 TWINKLY_TRANSPORT=http npm start` (serves `http://127.0.0.1:3000/mcp`)

## Notes

- `type` is `module` (ESM): use `import`/`export`, not `require`.
- On stdio transport, **never** write logs to stdout — it corrupts the MCP JSON-RPC stream. Log to stderr.
- Twinkly auth tokens expire; the device manager owns the token lifecycle (twinklyjs re-auths automatically, but cache per device).
- Treat device IPs and any credentials as configuration (env vars), never hardcoded.
