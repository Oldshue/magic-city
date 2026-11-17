import { CubicBezierCurve3, MathUtils, Vector3 } from '../../vendor/three.module.min.js';

const APPROACH = 'approaching';
const BROWSE = 'browsing';
const RETURN = 'rejoining';
const APPROACH_LENGTH = 4.55;
const RETURN_LENGTH = 2.25;
const ACCELERATION = 2.8;
const FOOTPRINT = .82;

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
  const returnLength = returnPath.getLength();
  const ahead = new Vector3(), tangent = new Vector3();
  const pose = {phase:null, point:point(laneX,entryZ), heading:Math.PI, speed:cruise, glance:0, inspection:null};
  let distance = 0, linger = 0;

  function enter(previousZ,nextZ,blocked) {
    if (pose.phase || previousZ<entryZ || nextZ>=entryZ || blocked(x,z,1.05)) return false;
    pose.phase = APPROACH;
    pose.speed = cruise;
    pose.point.copy(approach.v0);
    pose.heading = Math.PI;
    pose.glance = 0;
    distance = 0;
    return true;
  }

  function step(dt,blocked) {
    if (pose.phase===BROWSE) {
      linger += dt;
      if (linger>=duration || blocked(x,z,.90)) {
        pose.phase = RETURN;
        pose.inspection = null;
        distance = 0;
      } else {
        pose.inspection = linger/duration;
      }
      return pose;
    }
    if (!pose.phase) return pose;

    const arriving = pose.phase===APPROACH;
    const curve = arriving ? approach : returnPath;
    const length = arriving ? approachLength : returnLength;
    const remaining = length-distance;
    curve.getPointAt(Math.min(1,(distance + .68)/length),ahead);
    const targetSpeed = blocked(ahead.x,ahead.z,FOOTPRINT) ? 0
      : arriving ? Math.min(cruise,Math.sqrt(2*ACCELERATION*remaining)) : cruise;
    const change = MathUtils.clamp(targetSpeed-pose.speed,-dt*ACCELERATION,dt*ACCELERATION);
    const advance = (pose.speed+change*.5)*dt;
    pose.speed += change;
    distance = Math.min(length,distance+advance);
    const t = curve.getUtoTmapping(distance/length);
    curve.getPoint(t,pose.point);
    curve.getTangent(t,tangent);
    pose.heading = Math.atan2(tangent.x,tangent.z);
    pose.glance = arriving ? MathUtils.smoothstep(distance, .4, approachLength)
      : 1-MathUtils.smoothstep(distance,0,1.18);
    if (remaining>advance) return pose;

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

  return {pose, enter, step, target:window.target};
}
