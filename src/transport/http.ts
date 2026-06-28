/**
 * Streamable HTTP transport (Phase 7).
 *
 * Hosts the MCP server over the Streamable HTTP transport on a single `/mcp`
 * endpoint, with per-session state. Each client `initialize` mints a session id
 * and gets its own {@link McpServer} instance (sharing the process-wide device
 * manager); subsequent requests are routed back to that session's transport by
 * the `mcp-session-id` header. GET opens the SSE stream, DELETE terminates.
 *
 * Binds to loopback by default — an MCP HTTP endpoint is a local control plane,
 * not something to expose on the LAN.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../logger.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PATH = '/mcp';

export interface HttpTransportOptions {
  port: number;
  host?: string;
  path?: string;
  logger: Logger;
  /** Factory for a fresh MCP server per session (shares deviceManager/config). */
  createMcpServer: () => McpServer;
  /** Session id generator — injectable for deterministic tests. */
  generateSessionId?: () => string;
}

export interface RunningHttpServer {
  /** The actual bound port (resolves `port: 0` to the OS-assigned port). */
  port: number;
  /** Full URL of the MCP endpoint. */
  url: string;
  close: () => Promise<void>;
}

const SESSION_HEADER = 'mcp-session-id';

/** Start the HTTP server and resolve once it is listening. */
export function startHttpTransport(options: HttpTransportOptions): Promise<RunningHttpServer> {
  const host = options.host ?? DEFAULT_HOST;
  const path = options.path ?? DEFAULT_PATH;
  const generateSessionId = options.generateSessionId ?? randomUUID;
  const { logger, createMcpServer } = options;

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      logger.error('HTTP request handler failed', err);
      if (!res.headersSent) writeJsonError(res, 500, 'Internal server error');
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    if (url.pathname !== path) {
      writeJsonError(res, 404, `Not found. The MCP endpoint is ${path}.`);
      return;
    }

    const sessionId = headerValue(req, SESSION_HEADER);

    if (req.method === 'POST') {
      await handlePost(req, res, sessionId);
      return;
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      const transport = sessionId ? sessions.get(sessionId) : undefined;
      if (!transport) {
        writeJsonError(res, 404, 'Unknown or missing session id.');
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }
    writeJsonError(res, 405, `Method ${req.method ?? 'unknown'} not allowed.`);
  }

  async function handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
  ): Promise<void> {
    const body = await readJsonBody(req);

    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(req, res, body);
      return;
    }
    if (sessionId) {
      writeJsonError(res, 404, 'Unknown session id.');
      return;
    }
    if (!isInitializeRequest(body)) {
      writeJsonError(res, 400, 'Expected an initialize request to start a new session.');
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: generateSessionId,
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
        logger.debug(`HTTP session opened: ${id}`);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
        logger.debug(`HTTP session closed: ${id}`);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  return new Promise<RunningHttpServer>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, host, () => {
      httpServer.removeListener('error', reject);
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        port,
        url: `http://${host}:${port}${path}`,
        close: () => closeServer(httpServer, sessions),
      });
    });
  });
}

async function closeServer(
  httpServer: Server,
  sessions: Map<string, StreamableHTTPServerTransport>,
): Promise<void> {
  for (const transport of sessions.values()) {
    await transport.close().catch(() => {});
  }
  sessions.clear();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length === 0) return undefined;
  return JSON.parse(raw);
}

function writeJsonError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: status === 400 ? -32600 : -32000, message },
      id: null,
    }),
  );
}
