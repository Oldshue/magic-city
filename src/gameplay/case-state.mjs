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
