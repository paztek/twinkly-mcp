# twinkly-mcp

> A Model Context Protocol (MCP) server that gives AI agents control of your [Twinkly](https://www.twinkly.com/) lights.

Point an MCP-capable assistant (Claude Desktop, Claude Code, etc.) at this server and ask it to turn your lights on, set a color, change brightness, or switch effects — in plain language.

It's built on top of the [`@twinklyjs/twinkly`](https://github.com/twinklyjs/twinklyjs) library, which talks to Twinkly devices over their local network API.

## What you can do

Ask your assistant things like:

- "Turn the Christmas tree lights on / off"
- "Make the lights warm white at 40% brightness"
- "Set them to green"
- "Switch to the sparkle effect"
- "What are my lights doing right now?"
- "Discover my Twinkly devices"

## Requirements

- Node.js 20+
- One or more Twinkly devices on the same local network
- An MCP client (e.g. Claude Desktop or Claude Code)

## Installation

```bash
npx twinkly-mcp
```

(Or clone this repo and run `npm install && npm run build`, then `node dist/index.js`.)

## Configuration

The server is configured via environment variables (CLI flags and an optional JSON config file are also supported — see [CLAUDE.md](./CLAUDE.md)).

### Devices

| Variable | Description |
|----------|-------------|
| `TWINKLY_IP` | IP address of a single device (e.g. `192.168.1.50`); registered as the device named `default`. |
| `TWINKLY_DEVICES` | JSON map of named devices, e.g. `{"tree":"192.168.1.50","window":"192.168.1.51"}`. |
| `TWINKLY_DEFAULT_DEVICE` | Name of the device to use when a request doesn't specify one. |
| `TWINKLY_DISCOVERY` | `true` to auto-discover devices on the network at startup. |

Don't know your device's IP? Enable discovery, or just ask the assistant to "discover my Twinkly devices".

### Transport, safety & diagnostics

| Variable | Default | Description |
|----------|---------|-------------|
| `TWINKLY_TRANSPORT` | `stdio` | `stdio` (for local MCP clients) or `http` (Streamable HTTP on `/mcp`). |
| `TWINKLY_PORT` | `3000` | Port for the HTTP transport. Binds to `127.0.0.1`. |
| `TWINKLY_READONLY` | `false` | `true` exposes only read tools — no changes to your lights. |
| `TWINKLY_TOOLS` | _(all)_ | Comma-separated allow-list of tool groups: `discovery,status,power,color,effects,movies,admin`. |
| `TWINKLY_ALLOW_ADMIN` | `false` | `true` exposes the gated admin tools (`set_name`, `set_timer`, `send_frame`). Off by default. |
| `TWINKLY_TIMEOUT_MS` | `10000` | Per-request timeout. |
| `TWINKLY_LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug`. Logs go to stderr only. |

## Tools

Every device-targeting tool takes an optional `device` argument (a name from `list_devices`); omit it to use the default device.

**Discovery & status (read-only)**

| Tool | What it does |
|------|--------------|
| `list_devices` | List the devices the server knows about. |
| `discover_devices` | Scan the network for Twinkly devices and add new ones. |
| `get_device_details` | Hardware/firmware details (product, model, LED count, MAC, uptime…). |
| `get_summary` | Quick overview: mode, color, timer, music, filters. |
| `get_state` | Current mode, brightness, saturation, and color in one call. |

**Control**

| Tool | What it does |
|------|--------------|
| `set_power` | Turn the lights on (movie mode) or off. |
| `set_mode` | Set the operation mode directly (`off`, `color`, `demo`, `movie`, `effect`, `rt`, `playlist`). |
| `set_color` | Set a static color (`rgb` or `hsv`) and switch to color mode. |
| `set_brightness` | Set brightness 0–100. |
| `set_saturation` | Set saturation 0–100. |
| `list_effects` / `set_effect` | List predefined effects / play one by id. |
| `list_movies` / `set_movie` | List saved movies / play one by id. |

**Admin (gated behind `TWINKLY_ALLOW_ADMIN=true`)**

| Tool | What it does |
|------|--------------|
| `set_name` | Rename a device. |
| `set_timer` | Schedule daily on/off times. |
| `send_frame` | Push one realtime frame of per-LED RGB values over UDP. |

The riskier device operations the underlying library can do (firmware, WiFi/network, MQTT, mic, factory reset) are intentionally **not** exposed.

## Connecting an MCP client

### Claude Desktop / Claude Code (stdio)

Add the server to your MCP client configuration:

```json
{
  "mcpServers": {
    "twinkly": {
      "command": "npx",
      "args": ["twinkly-mcp"],
      "env": {
        "TWINKLY_IP": "192.168.1.50"
      }
    }
  }
}
```

Restart the client, and the Twinkly tools will be available to the assistant.

### Streamable HTTP

Run the server with the HTTP transport:

```bash
TWINKLY_IP=192.168.1.50 TWINKLY_TRANSPORT=http TWINKLY_PORT=3000 npx twinkly-mcp
```

It serves the MCP endpoint at `http://127.0.0.1:3000/mcp`. Point an HTTP-capable MCP client at that URL.

## How it works

```
AI assistant  ──MCP──>  twinkly-mcp  ──local HTTP/UDP──>  Twinkly device(s)
```

The server translates natural-language requests into MCP tool calls, which it maps onto the Twinkly device API on your local network. Your device IPs and tokens stay local — nothing is sent to the cloud by this server.

## Development

```bash
npm install
npm run dev          # run in watch mode (tsx)
npm run build        # compile to dist/
npm test             # run the test suite
npm run test:coverage

# Real-device smoke test (read-only; skipped without a device):
TWINKLY_IP=192.168.1.50 npx vitest run src/integration.test.ts
```

See [CLAUDE.md](./CLAUDE.md) for architecture, the full configuration reference, and the build history.

## License

ISC
