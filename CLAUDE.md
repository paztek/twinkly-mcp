# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`twinkly-mcp` is a Model Context Protocol (MCP) server that exposes control of [Twinkly](https://www.twinkly.com/) smart lights to AI agents. It wraps the [`@twinklyjs/twinkly`](https://github.com/twinklyjs/twinklyjs) library and surfaces a curated, agent-friendly set of MCP tools.

> **Current state: Phase 0 complete.** TypeScript toolchain, deps, scripts, and CI are in place; `src/index.ts` is a placeholder bin. The plan below tracks the build — update the checkboxes as phases land.

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
├── index.ts            # bin entry: parse args/env → start transport
├── server.ts           # creates McpServer, registers tools, wires transport
├── config.ts           # zod-validated config: env + config file + CLI flags
├── twinkly/
│   ├── device-manager.ts  # registry: name→TwinklyClient, lazy auth, discovery cache
│   └── format.ts          # normalize device responses for LLM-friendly output
├── tools/
│   ├── index.ts        # registerAllTools(server, ctx), honors enable/disable flags
│   ├── discovery.ts    # discover_devices, list_devices
│   ├── status.ts       # get_device_details, get_summary, get_state (read)
│   ├── power.ts        # set_power, set_mode
│   ├── color.ts        # set_color (rgb/hsv), set_brightness, set_saturation
│   ├── effects.ts      # list_effects, set_effect
│   ├── movies.ts       # list_movies, set_movie, playlists
│   └── device-admin.ts # set_name, set_timer (gated)
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
- [ ] **Phase 1 — Config layer.** `config.ts`: zod schema merging defaults ← file ← env ← CLI. Fail fast. Unit tests for precedence. (No device needed.)
- [ ] **Phase 2 — Device manager.** Wrap `TwinklyClient` per device; lazy auth + token reuse; resolve `device` param → client (fallback to default); optional discovery cache; map `FetchError` → typed errors. Tests with mocked client.
- [ ] **Phase 3 — MCP bootstrap (stdio).** `server.ts` + `index.ts` wire `StdioServerTransport`. Register `list_devices`, verify with MCP Inspector. **Milestone: connectable server.**
- [ ] **Phase 4 — Read tools.** `discover_devices`, `get_device_details`, `get_summary`, composite `get_state` (mode + color + brightness). Compact normalized JSON output.
- [ ] **Phase 5 — Control tools.** `set_power`, `set_mode`, `set_color` (`{r,g,b}` or `{h,s,v}`), `set_brightness`, `set_saturation`, `list_effects`/`set_effect`, `list_movies`/`set_movie`, playlists. Strict zod ranges. **Milestone: full everyday control.**
- [ ] **Phase 6 — Safety & flexibility.** Read-only mode, tool-group filtering, admin gate. Agent-tuned tool descriptions. Optional gated raw passthrough.
- [ ] **Phase 7 — Optional extras.** Streamable HTTP transport; realtime/`sendFrame` tool (Node-only, flag-gated).
- [ ] **Phase 8 — Tests & docs.** Unit tests toward 80%; guarded integration smoke test (`TWINKLY_IP`); finalize README with MCP client config; refresh this file with real commands.

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

## Notes

- `type` is `module` (ESM): use `import`/`export`, not `require`.
- On stdio transport, **never** write logs to stdout — it corrupts the MCP JSON-RPC stream. Log to stderr.
- Twinkly auth tokens expire; the device manager owns the token lifecycle (twinklyjs re-auths automatically, but cache per device).
- Treat device IPs and any credentials as configuration (env vars), never hardcoded.
