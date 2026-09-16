// Safe in-memory fallback store for iframe / strict privacy sandbox environments
const inMemoryStore = new Map<string, string>();

export function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore security/access errors in sandboxed iframes
  }
  return inMemoryStore.get(key) ?? null;
}

export function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Ignore security/access errors in sandboxed iframes
  }
  inMemoryStore.set(key, value);
}

export function safeRemoveLocalStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch {
    // Ignore security/access errors in sandboxed iframes
  }
  inMemoryStore.delete(key);
}

export function safeGetSessionStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // Ignore security/access errors in sandboxed iframes
  }
  return inMemoryStore.get('session:' + key) ?? null;
}

export function safeSetSessionStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    // Ignore security/access errors in sandboxed iframes
  }
  inMemoryStore.set('session:' + key, value);
}
