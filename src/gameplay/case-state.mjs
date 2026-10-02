/** Data-driven investigation state. Rendering and input remain in narrative. */
export function createCaseState(definition) {
  const evidence = new Set();
  const testimony = new Set();
  let outcome = null;
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(snapshot()); };
  const has = (ids = []) => ids.every(id => evidence.has(id) || testimony.has(id));
  function snapshot() { return { evidence: [...evidence], testimony: [...testimony], outcome }; }
  return {
    definition, snapshot, has,
    save() { return { version: 1, caseId: definition.id, evidence: [...evidence], testimony: [...testimony], suspectId: outcome?.suspectId ?? null }; },
    restore(saved) {
      if (!saved || saved.version !== 1 || saved.caseId !== definition.id
        || !Array.isArray(saved.evidence) || !Array.isArray(saved.testimony)
        || !saved.evidence.every(id => typeof id === 'string') || !saved.testimony.every(id => typeof id === 'string')
        || new Set(saved.evidence).size !== saved.evidence.length || new Set(saved.testimony).size !== saved.testimony.length
        || (saved.suspectId !== null && typeof saved.suspectId !== 'string')) return false;
      // Replay acquisition rules into a disposable state. Invalid or obsolete saves
      // never partially overwrite the current investigation.
      const recovered = createCaseState(definition);
      const pendingClues = new Set(saved.evidence);
      const pendingTestimony = new Set(saved.testimony);
      while (pendingClues.size || pendingTestimony.size) {
        let progressed = false;
        for (const id of pendingClues) {
          if (recovered.collect(id)) { pendingClues.delete(id); progressed = true; }
        }
        for (const witness of definition.witnesses) {
          for (const choice of witness.choices) {
            if (pendingTestimony.has(choice.grants) && recovered.say(witness.id, choice.id) !== null) {
              pendingTestimony.delete(choice.grants); progressed = true;
            }
          }
        }
        if (!progressed) return false;
      }
      if (saved.suspectId !== null && !recovered.conclude(saved.suspectId)) return false;
      const next = recovered.snapshot();
      evidence.clear(); testimony.clear();
      for (const id of next.evidence) evidence.add(id);
      for (const id of next.testimony) testimony.add(id);
      outcome = next.outcome; notify(); return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    collect(id) {
      const clue = definition.clues.find(item => item.id === id);
      if (outcome || !clue || !has(clue.requires) || evidence.has(id)) return false;
      evidence.add(id); notify(); return true;
    },
    say(witnessId, choiceId) {
      const witness = definition.witnesses.find(item => item.id === witnessId);
      const choice = witness?.choices.find(item => item.id === choiceId);
      if (outcome || !choice || !has(choice.requires)) return null;
      if (choice.grants) testimony.add(choice.grants);
      notify(); return choice.response;
    },
    conclude(suspectId) {
      const suspect = definition.suspects.find(item => item.id === suspectId);
      if (outcome || !suspect || !has(definition.accusationRequires)) return null;
      const proven = suspect.correct && has(definition.proofRequires);
      outcome = { suspectId, verdict: proven ? 'proved' : suspect.correct ? 'unproven' : 'wrong', text: proven ? suspect.proved : suspect.failed };
      notify(); return outcome;
    },
    reset() { evidence.clear(); testimony.clear(); outcome = null; notify(); },
  };
}
