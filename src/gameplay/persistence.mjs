/** One asynchronous persistence interface for native pages and isolated previews. */
export function createPersistentStorage({ storage, asynchronous } = {}) {
  if (storage === undefined) {
    try { storage = localStorage; asynchronous = false; }
    catch (_) { storage = null; }
    if (!storage && typeof AgentForgePreview !== 'undefined' && AgentForgePreview.storage) {
      storage = AgentForgePreview.storage; asynchronous = true;
    }
  }
  // One outstanding host write and one latest snapshot per key. Rapid changes
  // coalesce rather than flooding a host broker with concurrent requests.
  const writes = new Map();
  let transport = Promise.resolve();
  function request(operation) {
    const next = transport.then(operation);
    transport = next.then(() => undefined, () => undefined);
    return next;
  }
  return {
    async getItem(key) {
      if (writes.has(key)) await writes.get(key).promise;
      return !storage ? null : asynchronous ? await request(() => storage.getItem(key)) : storage.getItem(key);
    },
    setItem(key, value) {
      if (!storage) return Promise.resolve();
      if (!asynchronous) {
        try { storage.setItem(key, value); return Promise.resolve(); }
        catch (error) { return Promise.reject(error); }
      }
      const current = writes.get(key);
      if (current) { current.value = value; current.pending = true; return current.promise; }
      const job = { value, pending: true, promise: null };
      writes.set(key, job);
      job.promise = (async () => {
        while (job.pending) {
          const next = job.value; job.pending = false;
          await request(() => storage.setItem(key, next));
        }
      })().finally(() => { if (writes.get(key) === job) writes.delete(key); });
      return job.promise;
    },
    async flush() { await Promise.all([...writes.values()].map(job => job.promise)); },
  };
}
