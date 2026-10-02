/** One arbitration point for readables, vehicles, evidence and conversations. */
export function createInteractions() {
  const providers = new Set();
  const blockers = new Set();
  return {
    register(provider) { providers.add(provider); return () => providers.delete(provider); },
    block(owner, blocked) { if (blocked) blockers.add(owner); else blockers.delete(owner); },
    candidate() {
      if (blockers.size) return null;
      let chosen = null;
      for (const provider of providers) {
        const next = provider();
        if (!next) continue;
        if (!chosen || (next.priority || 0) > (chosen.priority || 0)
          || ((next.priority || 0) === (chosen.priority || 0) && next.distance < chosen.distance)) chosen = next;
      }
      return chosen;
    },
    activate() { const next = this.candidate(); if (!next) return false; next.activate(); return true; },
  };
}
