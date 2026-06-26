# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`twinkly-mcp` is a Model Context Protocol (MCP) server that exposes control of [Twinkly](https://www.twinkly.com/) smart lights to AI agents. It wraps the [`@twinklyjs/twinkly`](https://github.com/twinklyjs/twinklyjs) library and surfaces a curated, agent-friendly set of MCP tools.

> **Current state: skeleton.** Only `package.json` (ESM, `type: module`, `main: index.js`), `README.md`, `.gitignore` exist. No source code or dependencies yet. The plan below tracks the build. Update the checkboxes as phases land.

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

- [ ] **Phase 0 — Setup.** Add deps (`typescript`, `tsx`, `@modelcontextprotocol/sdk`, `@twinklyjs/twinkly`, `zod`, `vitest`). Add `tsconfig.json` (NodeNext), `build`/`dev`/`test`/`lint` scripts, `bin: { "twinkly-mcp": "dist/index.js" }`. Ignore `dist/`.
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

> To be populated in Phase 0/8. Current placeholder: `npm test` exits 1 ("no test specified").

## Notes

- `type` is `module` (ESM): use `import`/`export`, not `require`.
- On stdio transport, **never** write logs to stdout — it corrupts the MCP JSON-RPC stream. Log to stderr.
- Twinkly auth tokens expire; the device manager owns the token lifecycle (twinklyjs re-auths automatically, but cache per device).
- Treat device IPs and any credentials as configuration (env vars), never hardcoded.
