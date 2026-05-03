import { constants as fsConstants, promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

type NextHandler = () => void;

type ClipboardPayload = {
  text: string;
  updatedAt: string | null;
};

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, '.data');
const dataFile = path.join(dataDir, 'clipboard.json');
const maxBodyBytes = 1_000_000;

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const checkHealth = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.access(dataDir, fsConstants.W_OK);

  return {
    status: 'ok',
    storage: 'writable',
  };
};

const readStoredClipboard = async (): Promise<ClipboardPayload> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ClipboardPayload>;

    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { text: '', updatedAt: null };
    }

    throw error;
  }
};

const writeStoredClipboard = async (text: string): Promise<ClipboardPayload> => {
  const payload = {
    text,
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(`${dataFile}.tmp`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(`${dataFile}.tmp`, dataFile);

  return payload;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  let bytes = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;

    if (bytes > maxBodyBytes) {
      throw new Error('Request body is too large.');
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const getTextFromRequest = async (request: IncomingMessage): Promise<string> => {
  const body = await readBody(request);
  const parsed = body ? (JSON.parse(body) as { text?: unknown }) : {};

  if (typeof parsed.text !== 'string') {
    throw new Error('Expected a string text field.');
  }

  return parsed.text;
};

const clipboardApiPlugin = (): Plugin => {
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: NextHandler,
  ) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.statusCode = 405;
        response.setHeader('Allow', 'GET, HEAD');
        response.end();
        return;
      }

      try {
        sendJson(response, 200, await checkHealth());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Health check failed.';
        sendJson(response, 503, {
          status: 'error',
          storage: 'unavailable',
          error: message,
        });
      }

      return;
    }

    if (url.pathname !== '/api/clipboard') {
      next();
      return;
    }

    try {
      if (request.method === 'GET') {
        sendJson(response, 200, await readStoredClipboard());
        return;
      }

      if (request.method === 'PUT' || request.method === 'POST') {
        const text = await getTextFromRequest(request);
        sendJson(response, 200, await writeStoredClipboard(text));
        return;
      }

      response.statusCode = 405;
      response.setHeader('Allow', 'GET, PUT, POST');
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected clipboard API error.';
      sendJson(response, 400, { error: message });
    }
  };

  return {
    name: 'clipboard-api',
    configureServer(server) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleRequest);
    },
  };
};

export default defineConfig({
  plugins: [clipboardApiPlugin()],
});
