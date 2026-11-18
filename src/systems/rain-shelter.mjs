import { CubicBezierCurve3, MathUtils, Vector3 } from '../../vendor/three.module.min.js';
import { createStorefrontWalk } from './sidewalk-circuit.mjs';

export const SEEK_SHELTER_RAIN = .42;
const EASING_RAIN = .32;
const MINIMUM_PAUSE = 1.9;
const SEEKING = 'seeking shelter';
const SHELTERED = 'under the awning';
const LEAVING = 'leaving shelter';

/** Match the street-facing sloped cover and the roof over the room behind it. */
export function underStoreCover(shelters,x,y,z) {
  for (const shelter of shelters) {
    const {side,wallX,halfWidth,start,projection,wallY,eaveY,roomY,roomHalfWidth,roomDepth} = shelter;
    const depth=(wallX-x)*side;
    const offset=Math.abs(z-shelter.z);
    if (depth<start) {
      if (depth>-roomDepth && offset<roomHalfWidth && y<roomY) return true;
      continue;
    }
    if (depth>=projection || offset>=halfWidth) continue;
    const t=(depth-start)/(projection-start);
    if (y<MathUtils.lerp(wallY,eaveY,t)) return true;
  }
  return false;
}

/** A pedestrian detours only from the storefront leg, then returns to that same sidewalk. */
export function createRainShelter(shelter,laneX,cruise) {
  const pose = {phase:null,point:new Vector3(),heading:Math.PI,speed:0,hunch:0,lookUp:0};
  const walk = createStorefrontWalk(pose);
  let sinceEntry = 0, shelteredTime = 0;

  function enter(x,z,heading,speed,blocked) {
    if (pose.phase) return false;
    let best = Infinity;
    let destination = null;
    for (const bay of shelter.bays) {
      const delta=z-bay.z;
      if (delta< -1.0 || delta>13.5 || blocked(bay.x,bay.z,.96)) continue;
      const distance=Math.hypot(x-bay.x,delta);
      if (distance<best) {
        best=distance;
        destination=bay;
      }
    }
    if (!destination) return false;
    const start=pose.point.set(x,destination.y,z).clone();
    pose.heading=heading;
    pose.speed=Math.min(speed,cruise*1.42);
    sinceEntry=0;
    if (best<.25) {
      pose.phase=SHELTERED;
      pose.speed=0;
      shelteredTime=0;
      return true;
    }
    const lead=Math.min(1.55,best*.36);
    const ahead=new Vector3(start.x+Math.sin(heading)*lead,start.y,start.z+Math.cos(heading)*lead);
    const approach = new Vector3(destination.x-shelter.side*Math.min(.72,best*.28),
      destination.y,destination.z+Math.min(1.18,best*.31));
    // Keep the approach above the sidewalk even if the previous step was a sidestep.
    const limit=Math.abs(laneX)-.82;
    const face=Math.abs(shelter.wallX)-.64;
    ahead.x=shelter.side*MathUtils.clamp(Math.abs(ahead.x),limit,face);
    approach.x=shelter.side*MathUtils.clamp(Math.abs(approach.x),limit,face);
    walk.begin(new CubicBezierCurve3(start,ahead,approach,destination),true);
    pose.phase=SEEKING;
    return true;
  }

  function step(dt,rain,blocked) {
    if (!pose.phase) return pose;
    sinceEntry+=dt;
    const seeking=pose.phase===SEEKING;
    const sheltered=pose.phase===SHELTERED;
    const urgency=seeking ? .72 : sheltered ? 0 : .12;
    pose.hunch=MathUtils.damp(pose.hunch,urgency,5,dt);
    pose.lookUp=seeking ? Math.sin(Math.PI*Math.min(1,sinceEntry/.95))*.23 : 0;
    if (sheltered) {
      shelteredTime+=dt;
      const towardStreet=-shelter.side*Math.PI/2;
      pose.heading+=Math.atan2(Math.sin(towardStreet-pose.heading),Math.cos(towardStreet-pose.heading))*Math.min(1,dt*3.3);
      if (rain>EASING_RAIN || shelteredTime<MINIMUM_PAUSE) return pose;
      const start=pose.point.clone();
      const leaveZ=start.z-2.36;
      if (blocked(laneX,leaveZ,.91)) return pose;
      const outward=start.clone().lerp(new Vector3(laneX,start.y,start.z-.38),.38);
      const finish=new Vector3(laneX,start.y,leaveZ);
      const turn=finish.clone().add(new Vector3(0,0,.79));
      walk.begin(new CubicBezierCurve3(start,outward,turn,finish),false);
      pose.phase=LEAVING;
      return pose;
    }
    if (walk.step(dt,seeking ? cruise*1.42 : cruise,blocked)) {
      if (seeking) {
        pose.phase=SHELTERED;
        pose.speed=0;
        shelteredTime=0;
      } else {
        pose.phase=null;
        pose.hunch=0;
        pose.lookUp=0;
      }
    }
    return pose;
  }

  return {pose,enter,step};
}
