# Clipboard

A small Vite + TypeScript clipboard page with server-backed persistence.

The text is stored in `.data/clipboard.json` by Vite middleware, so multiple browsers pointed at the same local URL share the same value.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite in any browser. Use the same URL from other browsers to see the same saved text.

## Build

```sh
npm run build
npm run preview
```

The built app still needs to be served by Vite preview or an equivalent server that implements `/api/clipboard`.

## Docker

```sh
docker build -t clipboard .
docker run --rm -p 4173:4173 -v clipboard-data:/app/.data clipboard
```

Open `http://localhost:4173` from any browser. The Docker volume stores `.data/clipboard.json` so the text survives container restarts.

The container exposes `GET /health`, which returns `200` when the app can write to its persistence directory.
