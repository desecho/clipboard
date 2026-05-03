import { defineConfig, type Plugin } from 'vite';

import { createApiMiddleware } from './server/http';

const clipboardApiPlugin = (): Plugin => {
  return {
    name: 'clipboard-api',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
  };
};

export default defineConfig({
  plugins: [clipboardApiPlugin()],
});
