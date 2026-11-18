import { HALF_LENGTH, HALF_WIDTH } from './vehicle-motion.mjs';

const SHOULDER_RADIUS = .29;
const STANDOFF = .56;
const BRAKE_ACCELERATION = 7.4;
const EMERGENCY_ACCELERATION = 10.4;
const TYRE_LAG_SECONDS = 1/15;
const BODY_WIDTH = HALF_WIDTH+SHOULDER_RADIUS;
const BODY_LENGTH = HALF_LENGTH+SHOULDER_RADIUS;

/** Measure the bumper room to someone in or entering the intended lane. */
export function pedestrianBrakeRoom(people,x,z,heading,direction,speed) {
  const sx=Math.sin(heading), cz=Math.cos(heading);
  const timeToStop=Math.abs(speed)/BRAKE_ACCELERATION+TYRE_LAG_SECONDS;
  let room=Infinity;
  for (const person of people) {
    if (!person.committed) continue;
    const dx=person.x-x, dz=person.z-z;
    const along=(dx*sx+dz*cz)*direction;
    if (along<0) continue;
    const across=dx*cz-dz*sx;
    const drift=(person.vx ?? 0)*cz-(person.vz ?? 0)*sx;
    const future=across+drift*timeToStop;
    if (Math.min(across,future)>BODY_WIDTH+.08 || Math.max(across,future)<-BODY_WIDTH-.08) continue;
    room=Math.min(room,along-BODY_LENGTH-STANDOFF);
  }
  return room;
}

/** Leave room for braking and for the existing lag in the tyres. */
export function speedAtPedestrian(startSpeed,requestedSpeed,room,dt) {
  if (!Number.isFinite(room)) return requestedSpeed;
  const start=Math.abs(startSpeed);
  const available=Math.max(0,room-start*TYRE_LAG_SECONDS);
  const allowed=Math.sqrt(2*BRAKE_ACCELERATION*available);
  const underBraking=Math.max(allowed,start-EMERGENCY_ACCELERATION*dt);
  return Math.sign(requestedSpeed)*Math.min(Math.abs(requestedSpeed),underBraking);
}

export function crossingBodyBlocked(people,x,z,heading) {
  const sx=Math.sin(heading), cz=Math.cos(heading);
  return people.some(person=>{
    if (!person.committed) return false;
    const dx=person.x-x, dz=person.z-z;
    return Math.abs(dx*cz-dz*sx)<BODY_WIDTH && Math.abs(dx*sx+dz*cz)<BODY_LENGTH;
  });
}

/** Sweep the car envelope through one physics move so a long frame cannot pass through someone. */
export function pedestrianTravelFraction(people,x,z,heading,dx,dz) {
  const travel=Math.hypot(dx,dz);
  if (travel<1e-7) return 1;
  const sx=Math.sin(heading), cz=Math.cos(heading);
  const across=dx*cz-dz*sx, along=dx*sx+dz*cz;
  let clear=1;
  for (const person of people) {
    if (!person.committed) continue;
    const px=person.x-x, pz=person.z-z;
    const side=px*cz-pz*sx, forward=px*sx+pz*cz;
    if (Math.abs(side)<BODY_WIDTH && Math.abs(forward)<BODY_LENGTH) {
      // If someone moved up to a stopped car, allow it to back away.
      const shallow=BODY_WIDTH-Math.abs(side)<BODY_LENGTH-Math.abs(forward);
      if (shallow ? side*across<0 : forward*along<0) continue;
      return 0;
    }
    let enters=0, leaves=clear;
    for (const [position,motion,extent] of [[side,across,BODY_WIDTH],[forward,along,BODY_LENGTH]]) {
      if (Math.abs(motion)<1e-7) {
        if (Math.abs(position)>=extent) leaves=-1;
        continue;
      }
      const a=(position-extent)/motion, b=(position+extent)/motion;
      enters=Math.max(enters,Math.min(a,b));
      leaves=Math.min(leaves,Math.max(a,b));
    }
    if (enters<leaves) clear=Math.max(0,enters-.025/travel);
  }
  return clear;
}
