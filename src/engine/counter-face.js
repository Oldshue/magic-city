const MOUTH = {
  open: [.68, 0, .03, .12],
  round: [.28, 0, .68, 0],
  wide: [.32, 0, 0, .54],
  closed: [.01, .59, 0, 0],
  rest: [0, 0, 0, 0],
};
const MOUTH_KEYS = ['jawOpen', 'mouthClose', 'mouthPucker', 'mouthStretchLeft'];

export function findCounterFace(instance) {
  const meshes = [];
  instance.traverse(mesh => {
    if (mesh.morphTargetDictionary) meshes.push(mesh);
  });
  if (meshes.length) return {meshes, clock:0, blinkAt:2.2, cue:null, index:0, mouth:[0,0,0,0]};
  return null;
}

export function updateCounterFace(face, actor, dt) {
  const cue = actor?.speech;
  if (cue !== face.cue) {
    face.cue = cue;
    face.index = 0;
  }
  const time = cue?.time ?? 0;
  const cues = cue?.cues;
  while (cues && face.index < cues.length && time >= cues[face.index][1]) face.index++;
  const segment = cues?.[face.index];
  const shape = segment && time >= segment[0] ? segment[2] : 'rest';
  const mouth = MOUTH[shape];
  const blend = 1 - Math.exp(-dt * 24);
  for (let i = 0; i < mouth.length; i++) {
    face.mouth[i] += (mouth[i] - face.mouth[i]) * blend;
  }
  face.clock += dt;
  const sinceBlink = face.clock - face.blinkAt;
  if (sinceBlink > .20) {
    face.blinkAt += 3.0 + 2.1 * (.5 + .5 * Math.sin(face.blinkAt * 3.17));
  }
  const eyelid = Math.max(0, Math.min(sinceBlink / .071, (.191 - sinceBlink) / .119));
  const smile = actor?.attending ? (actor.id === 'staff-lunch' ? .23 : .14) : .05;
  const emphasis = cue ? .24 * Math.min(1, time * 7) * Math.exp(-time * 1.7) : 0;
  const expression = {
    eyeBlinkLeft: eyelid,
    eyeBlinkRight: eyelid * .97,
    mouthSmileLeft: smile,
    browOuterUpLeft: emphasis,
    browOuterUpRight: emphasis * .59,
  };
  for (let i = 0; i < MOUTH_KEYS.length; i++) expression[MOUTH_KEYS[i]] = face.mouth[i];
  for (const mesh of face.meshes) {
    for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
      if (Object.hasOwn(expression,key)) mesh.morphTargetInfluences[index] = expression[key];
    }
  }
}
