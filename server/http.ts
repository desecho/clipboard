import type { IncomingMessage, ServerResponse } from 'node:http';

import { checkHealth, readStoredClipboard, writeStoredClipboard } from './clipboard.js';
import { maxBodyBytes } from './config.js';

export type NextHandler = () => void;

export const sendJson = (
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  const body = JSON.stringify(payload);

  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(request.method === 'HEAD' ? undefined : body);
};

const sendMethodNotAllowed = (response: ServerResponse, allowedMethods: string) => {
  response.statusCode = 405;
  response.setHeader('Allow', allowedMethods);
  response.end();
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

const isHealthPath = (pathname: string) => pathname === '/health' || pathname === '/health/';

export const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (isHealthPath(url.pathname)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendMethodNotAllowed(response, 'GET, HEAD');
      return true;
    }

    try {
      sendJson(request, response, 200, await checkHealth());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed.';
      sendJson(request, response, 503, {
        status: 'error',
        storage: 'unavailable',
        error: message,
      });
    }

    return true;
  }

  if (url.pathname !== '/api/clipboard') {
    return false;
  }

  try {
    if (request.method === 'GET') {
      sendJson(request, response, 200, await readStoredClipboard());
      return true;
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const text = await getTextFromRequest(request);
      sendJson(request, response, 200, await writeStoredClipboard(text));
      return true;
    }

    sendMethodNotAllowed(response, 'GET, PUT, POST');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected clipboard API error.';
    sendJson(request, response, 400, { error: message });
  }

  return true;
};

export const createApiMiddleware =
  () => (request: IncomingMessage, response: ServerResponse, next: NextHandler) => {
    void handleApiRequest(request, response)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unexpected server error.';
        sendJson(request, response, 500, { error: message });
      });
  };
