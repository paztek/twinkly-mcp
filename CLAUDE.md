# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`twinkly-mcp` is a Model Context Protocol (MCP) server that exposes control of [Twinkly](https://www.twinkly.com/) smart lights to AI agents.

> Current state: skeleton. The repo contains only `package.json` (ESM — `type: module`, `main: index.js`, version `0.0.1`). There is no source code, no dependencies, no git history, and no real test script yet. Most of the implementation below is still to be built.

## Commands

- `npm test` — placeholder; currently exits 1 with "no test specified". Replace before relying on it.

No build, lint, or run scripts exist yet. Add them to `package.json` as the project takes shape.

## Architecture (to build)

The two domains this server bridges:

1. **MCP server side** — Expose tools/resources over the Model Context Protocol so an agent can discover and invoke light controls. Use the official MCP TypeScript/JavaScript SDK (`@modelcontextprotocol/sdk`). Entry point is `index.js` per `package.json`.
2. **Twinkly device side** — Twinkly devices expose a local HTTP/JSON API (the `xled` / `/xled/v1/...` endpoints) on the LAN. Control flow requires authenticating (login → verify to obtain an auth token), then issuing mode/brightness/color/effect calls. Network discovery is typically via the device IP on the local network.

When implementing, keep the MCP tool layer (protocol, schemas, validation) separate from a Twinkly client module (HTTP, auth token lifecycle, device state) so each can be tested in isolation.

## Notes

- `type` is `module` (ESM): use `import`/`export`, not `require`. If adopting TypeScript, add the corresponding build tooling.
- Twinkly auth tokens expire and must be refreshed; centralize token handling in the client module.
- Treat the device IP and any credentials as configuration (env vars), never hardcoded.
