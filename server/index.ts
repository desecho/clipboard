import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { distDir, host, port } from './config.js';
import { handleApiRequest } from './http.js';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const distRoot = path.resolve(distDir);

const sendText = (
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  message: string,
) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(message));
  response.end(request.method === 'HEAD' ? undefined : message);
};

const getFilePath = (pathname: string) => {
  if (pathname.includes('\0')) {
    return null;
  }

  const normalizedPath = path.posix.normalize(decodeURIComponent(pathname));
  const staticPath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const filePath = path.resolve(distRoot, `.${staticPath}`);

  return filePath === distRoot || filePath.startsWith(`${distRoot}${path.sep}`) ? filePath : null;
};

const serveFile = async (
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
  pathname: string,
) => {
  const body = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypes[extension] ?? 'application/octet-stream');
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader(
    'Cache-Control',
    pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  response.end(request.method === 'HEAD' ? undefined : body);
};

const serveStatic = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  const filePath = getFilePath(url.pathname);

  if (!filePath) {
    sendText(request, response, 403, 'Forbidden');
    return;
  }

  try {
    const stats = await fs.stat(filePath);

    if (stats.isFile()) {
      await serveFile(request, response, filePath, url.pathname);
      return;
    }
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (!path.extname(url.pathname)) {
    await serveFile(request, response, path.join(distRoot, 'index.html'), '/index.html');
    return;
  }

  sendText(request, response, 404, 'Not found');
};

const server = createServer((request, response) => {
  void (async () => {
    if (await handleApiRequest(request, response)) {
      return;
    }

    await serveStatic(request, response);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';

    if (!response.headersSent) {
      sendText(request, response, 500, message);
      return;
    }

    response.destroy(error instanceof Error ? error : undefined);
  });
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, host, () => {
  console.log(`Clipboard listening on http://${host}:${port}`);
});
