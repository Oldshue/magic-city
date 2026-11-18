import { CubicBezierCurve3, MathUtils, Vector3 } from '../../vendor/three.module.min.js';
import { createStorefrontWalk } from './sidewalk-circuit.mjs';

const APPROACH = 'approaching';
const BROWSE = 'browsing';
const RETURN = 'rejoining';
const APPROACH_LENGTH = 4.55;
const RETURN_LENGTH = 2.25;

/** A south-side approach and return leave the nearby shop entrance open. */
export function createWindowVisit(window, laneX, cruise, duration) {
  const {x,y,z} = window.point;
  const side = Math.sign(x-laneX);
  const point = (x,z) => new Vector3(x,y,z);
  const entryZ = z + APPROACH_LENGTH;
  const approach = new CubicBezierCurve3(point(laneX,entryZ),point(laneX,z+2.68),
    point(x-side*.57,z+.60),point(x,z));
  const returnPath = new CubicBezierCurve3(point(x,z),point(x+side*.19,z-.20),
    point(laneX,z-1.25),point(laneX,z-RETURN_LENGTH));
  const approachLength = approach.getLength();
  const pose = {phase:null, point:point(laneX,entryZ), heading:Math.PI, speed:cruise, glance:0, inspection:null};
  const walk=createStorefrontWalk(pose);
  let linger = 0;

  function enter(previousZ,nextZ,blocked) {
    if (pose.phase || previousZ<entryZ || nextZ>=entryZ || blocked(x,z,1.05)) return false;
    pose.phase = APPROACH;
    pose.speed = cruise;
    pose.point.copy(approach.v0);
    pose.heading = Math.PI;
    pose.glance = 0;
    walk.begin(approach,true);
    return true;
  }

  function step(dt,blocked) {
    if (pose.phase===BROWSE) {
      linger += dt;
      if (linger>=duration || blocked(x,z,.90)) {
        pose.phase = RETURN;
        pose.inspection = null;
        walk.begin(returnPath,false);
      } else {
        pose.inspection = linger/duration;
      }
      return pose;
    }
    if (!pose.phase) return pose;

    const arriving = pose.phase===APPROACH;
    const arrived=walk.step(dt,cruise,blocked);
    pose.glance = arriving ? MathUtils.smoothstep(walk.distance,.4,approachLength)
      : 1-MathUtils.smoothstep(walk.distance,0,1.18);
    if (!arrived) return pose;

    if (arriving) {
      pose.phase = BROWSE;
      pose.inspection = 0;
      pose.speed = 0;
      linger = 0;
    } else {
      pose.phase = null;
      pose.glance = 0;
    }
    return pose;
  }

  function cancel() {
    pose.phase=null;
    pose.inspection=null;
    pose.glance=0;
  }

  return {pose,enter,step,cancel,target:window.target};
}
