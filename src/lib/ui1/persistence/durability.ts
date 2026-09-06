/** Ask once per session, when the user saves, to protect local-only work. */
let request: Promise<boolean> | undefined;

export function requestPersistentStorage(): Promise<boolean> {
  if (request) return request;
  request = (async () => {
    try {
      const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
      if (!storage?.persist) return false;
      if (await storage.persisted()) return true;
      return await storage.persist();
    } catch {
      // Browsers may decline; regular saving must still work.
      return false;
    }
  })();
  return request;
}
