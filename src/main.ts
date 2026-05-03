import './style.css';

type ClipboardPayload = {
  text: string;
  updatedAt: string | null;
};

const fallbackStorageKey = 'clipboard:text';
const saveDelay = 350;
const remotePollDelay = 5_000;

const textarea = document.querySelector<HTMLTextAreaElement>('#clipboard');
const status = document.querySelector<HTMLDivElement>('#status');
const details = document.querySelector<HTMLSpanElement>('#details');
const clearButton = document.querySelector<HTMLButtonElement>('#clear');

if (!textarea || !status || !details || !clearButton) {
  throw new Error('Clipboard UI failed to initialize.');
}

let saveTimer: number | undefined;
let saving = false;
let remoteAvailable = true;
let lastSavedText = '';
let lastInputAt = 0;

const setStatus = (label: string, tone: 'idle' | 'busy' | 'error' = 'idle') => {
  status.textContent = label;
  status.dataset.tone = tone;
};

const updateDetails = () => {
  const count = textarea.value.length;
  details.textContent = `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`;
};

const readClipboard = async (): Promise<ClipboardPayload> => {
  const response = await fetch('/api/clipboard', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Read failed with status ${response.status}`);
  }

  return response.json() as Promise<ClipboardPayload>;
};

const writeClipboard = async (text: string): Promise<ClipboardPayload> => {
  const response = await fetch('/api/clipboard', {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }

  return response.json() as Promise<ClipboardPayload>;
};

const persistLocally = (text: string) => {
  localStorage.setItem(fallbackStorageKey, text);
  lastSavedText = text;
  setStatus('Saved locally');
};

const saveNow = async () => {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;

  const text = textarea.value;
  if (text === lastSavedText && !saving) {
    return;
  }

  saving = true;
  setStatus('Saving', 'busy');

  try {
    await writeClipboard(text);
    remoteAvailable = true;
    lastSavedText = text;
    localStorage.setItem(fallbackStorageKey, text);
    setStatus('Saved');
  } catch {
    remoteAvailable = false;
    persistLocally(text);
  } finally {
    saving = false;
  }
};

const scheduleSave = () => {
  lastInputAt = Date.now();
  setStatus(remoteAvailable ? 'Unsaved' : 'Local changes', remoteAvailable ? 'busy' : 'error');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveNow();
  }, saveDelay);
};

const loadInitialValue = async () => {
  setStatus('Loading', 'busy');

  try {
    const payload = await readClipboard();
    remoteAvailable = true;
    textarea.value = payload.text;
    lastSavedText = payload.text;
    localStorage.setItem(fallbackStorageKey, payload.text);
    setStatus('Saved');
  } catch {
    remoteAvailable = false;
    textarea.value = localStorage.getItem(fallbackStorageKey) ?? '';
    lastSavedText = textarea.value;
    setStatus('Saved locally');
  }

  updateDetails();
};

const refreshFromRemote = async () => {
  if (
    saving ||
    saveTimer !== undefined ||
    document.activeElement === textarea ||
    Date.now() - lastInputAt < remotePollDelay
  ) {
    return;
  }

  try {
    const payload = await readClipboard();
    remoteAvailable = true;

    if (payload.text !== textarea.value) {
      textarea.value = payload.text;
      lastSavedText = payload.text;
      localStorage.setItem(fallbackStorageKey, payload.text);
      updateDetails();
    }

    setStatus('Saved');
  } catch {
    remoteAvailable = false;
    setStatus('Saved locally');
  }
};

textarea.addEventListener('input', () => {
  updateDetails();
  scheduleSave();
});

textarea.addEventListener('blur', () => {
  if (saveTimer !== undefined) {
    void saveNow();
  }
});

clearButton.addEventListener('click', () => {
  textarea.value = '';
  textarea.focus();
  updateDetails();
  scheduleSave();
});

window.addEventListener('beforeunload', () => {
  const text = textarea.value;
  localStorage.setItem(fallbackStorageKey, text);

  if (remoteAvailable && text !== lastSavedText) {
    const payload = JSON.stringify({ text });
    navigator.sendBeacon('/api/clipboard', new Blob([payload], { type: 'application/json' }));
  }
});

void loadInitialValue();
window.setInterval(() => {
  void refreshFromRemote();
}, remotePollDelay);
