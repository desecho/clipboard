import path from 'node:path';

export const port = Number.parseInt(process.env.PORT ?? '4173', 10);
export const host = process.env.HOST ?? '0.0.0.0';
export const dataDir = process.env.CLIPBOARD_DATA_DIR ?? path.join(process.cwd(), '.data');
export const dataFile = path.join(dataDir, 'clipboard.json');
export const distDir = process.env.CLIPBOARD_DIST_DIR ?? path.join(process.cwd(), 'dist');
export const maxBodyBytes = 1_000_000;
