# twinkly-mcp

> A Model Context Protocol (MCP) server that gives AI agents control of your [Twinkly](https://www.twinkly.com/) lights.

Point an MCP-capable assistant (Claude Desktop, Claude Code, etc.) at this server and ask it to turn your lights on, set a color, change brightness, or switch effects — in plain language.

It's built on top of the [`@twinklyjs/twinkly`](https://github.com/twinklyjs/twinklyjs) library, which talks to Twinkly devices over their local network API.

> ⚠️ **Status: early development.** The server is being built phase by phase — see [CLAUDE.md](./CLAUDE.md) for the implementation plan and progress. It is not yet usable.

## What you'll be able to do

Ask your assistant things like:

- "Turn the Christmas tree lights on / off"
- "Make the lights warm white at 40% brightness"
- "Set them to green"
- "Switch to the sparkle effect"
- "What are my lights doing right now?"

## Requirements

- Node.js 20+
- One or more Twinkly devices on the same local network
- An MCP client (e.g. Claude Desktop or Claude Code)

## Installation

> Not published yet. Once available it will run via `npx` with no global install.

```bash
npx twinkly-mcp
```

## Configuration

The server is configured via environment variables. The most common setup is a single device by IP:

| Variable | Description |
|----------|-------------|
| `TWINKLY_IP` | IP address of your Twinkly device (e.g. `192.168.1.50`) |
| `TWINKLY_DEVICES` | JSON map of named devices, e.g. `{"tree":"192.168.1.50","window":"192.168.1.51"}` |
| `TWINKLY_DEFAULT_DEVICE` | Name of the device to use when a request doesn't specify one |
| `TWINKLY_DISCOVERY` | `true` to auto-discover devices on the network at startup |
| `TWINKLY_READONLY` | `true` to expose only read-only tools (no changes to your lights) |

Don't know your device's IP? With discovery enabled, the server can find devices automatically, or you can ask the assistant to "discover my Twinkly devices".

## Connecting an MCP client

### Claude Desktop / Claude Code

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

## How it works

```
AI assistant  ──MCP──>  twinkly-mcp  ──local HTTP──>  Twinkly device(s)
```

The server translates natural-language requests into MCP tool calls, which it maps onto the Twinkly device API on your local network. Your device IPs and tokens stay local — nothing is sent to the cloud by this server.

## Development

See [CLAUDE.md](./CLAUDE.md) for architecture, the configuration reference, and the phased build plan. Contributions and progress are tracked there.

## License

ISC
