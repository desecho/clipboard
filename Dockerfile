FROM node:22-alpine

WORKDIR /app

RUN chown node:node /app

COPY --chown=node:node package*.json ./

USER node

RUN npm ci

COPY --chown=node:node . .

RUN npm run build && mkdir -p .data

ENV NODE_ENV=production

EXPOSE 4173

VOLUME ["/app/.data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "preview", "--", "--port", "4173"]
