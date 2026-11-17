import { MathUtils } from '../../vendor/three.module.min.js';

export const DOOR_OPEN_ANGLE = 1.07;

export const ENTRY = {
  clip: 'Board', frames: 54, slide: 0, side: 1,
  open: [7, 18], close: [34, 52], latch: 51,
  footsteps: [[25, 'board']],
  feet: [
    ['l', 'street', 1.67, -0.27, 0, 19],
    ['r', 'street', 1.43, 0.02, 0, 13],
    ['r', 'board', 1.005, 0.021, 25, 35],
  ],
  hands: [['r', 'outside', 7, 19], ['l', 'inside', 31, 48]],
};

const exit = {
  clip: 'Disembark', frames: 58, slide: 0, side: 1,
  open: [7, 21], close: [38, 55], latch: 54,
  footsteps: [[25, 'board'], [38, 'street'], [45, 'street']],
  feet: [
    ['l', 'board', 1.006, -0.103, 25, 31],
    ['r', 'street', 1.68, 0.045, 38, 58],
    ['l', 'street', 1.60, -0.330, 45, 58],
  ],
  hands: [['l', 'inside', 7, 28], ['r', 'outside', 39, 51]],
};

export function exitMotion(side) {
  return side > 0 ? exit : passengerExit;
}

const passengerExit = {...exit, clip: 'DisembarkPassenger', frames: 74, slide: 16, side: -1};

export function doorAngle(motion, frame) {
  return -motion.side * DOOR_OPEN_ANGLE
    * MathUtils.smoothstep(frame, ...motion.open) * (1 - MathUtils.smoothstep(frame, ...motion.close));
}

export function contactWeight(frame, start, end, fade = 3) {
  return MathUtils.smoothstep(frame, start - fade, start) * (1 - MathUtils.smoothstep(frame, end, end + fade));
}
