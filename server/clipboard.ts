import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';

import { dataDir, dataFile } from './config.js';

export type ClipboardPayload = {
  text: string;
  updatedAt: string | null;
};

export const checkHealth = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.access(dataDir, fsConstants.W_OK);

  return {
    status: 'ok',
    storage: 'writable',
  };
};

export const readStoredClipboard = async (): Promise<ClipboardPayload> => {
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

export const writeStoredClipboard = async (text: string): Promise<ClipboardPayload> => {
  const payload = {
    text,
    updatedAt: new Date().toISOString(),
  };
  const tempFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, dataFile);

  return payload;
};
