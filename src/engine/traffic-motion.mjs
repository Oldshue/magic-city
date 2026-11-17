import { HALF_LENGTH, HALF_WIDTH } from './vehicle-motion.mjs';

const BRAKING = 4.2;
const ACCELERATION = 2.25;
const YIELD_MARGIN = .95;
const LOOKAHEAD = 27;

export const HEAVIEST_CORNER_CROSSWALK = Object.freeze({
  offset:14.5, depth:3.4, sidewalkApproach:3,
});

export function wrapDistance(value, length) {
  return ((value % length) + length) % length;
}

export function lanePosition(x, z, heading, offset) {
  return [x - Math.cos(heading)*offset, z + Math.sin(heading)*offset];
}

/** Distance to a pedestrian or car in the lane ahead, measured bumper to bumper. */
export function blockerGap(car, blocker) {
  if (!blocker || blocker.riding || (!blocker.mounted && blocker.y > 2.6)) return Infinity;
  const dx = blocker.x-car.x, dz=blocker.z-car.z;
  const sx=Math.sin(car.heading), cx=Math.cos(car.heading);
  const along=dx*sx + dz*cx;
  if (along <= 0 || along > LOOKAHEAD) return Infinity;
  const across=Math.abs(dx*cx - dz*sx);
  let depth=.45, width=.45;
  if (blocker.mounted) {
    const angle=blocker.heading-car.heading;
    const cos=Math.abs(Math.cos(angle)), sin=Math.abs(Math.sin(angle));
    width=HALF_WIDTH*cos + HALF_LENGTH*sin;
    depth=HALF_LENGTH*cos + HALF_WIDTH*sin;
  }
  if (across >= HALF_WIDTH + width + .20) return Infinity;
  return Math.max(0,along - HALF_LENGTH - depth - YIELD_MARGIN);
}

export function speedBefore(gap, leadSpeed = 0) {
  return Math.sqrt(leadSpeed*leadSpeed + 2*BRAKING*Math.max(0,gap));
}

export function advanceTraffic(speed, target, room, dt) {
  const next = target < speed ? Math.max(target,speed-BRAKING*dt)
    : Math.min(target,speed+ACCELERATION*dt);
  const travel = (speed+next)*dt*.5;
  return room < travel ? [0,Math.max(0,room)] : [next,travel];
}

function intersectSegments(a,b,c,d) {
  const ax=b.x-a.x, az=b.z-a.z, bx=d.x-c.x, bz=d.z-c.z;
  const determinant=ax*bz-az*bx;
  if (Math.abs(determinant)<.001) return null;
  const ex=c.x-a.x, ez=c.z-a.z;
  const u=(ex*bz-ez*bx)/determinant, v=(ex*az-ez*ax)/determinant;
  return u>=0 && u<=1 && v>=0 && v<=1 ? [u,v] : null;
}

export function makeJunction(routeA,routeB,crosswalk) {
  if (!routeA || !routeB) return null;
  let stationA=0;
  for (let i=0;i<routeA.segLens.length;i++) {
    let stationB=0;
    for (let j=0;j<routeB.segLens.length;j++) {
      const a=routeA.pts[i], b=routeA.pts[i+1];
      const cross=intersectSegments(a,b,routeB.pts[j],routeB.pts[j+1]);
      if (cross) {
        const [u,v]=cross;
        // The footprint must clear the far edge of the crossing before
        // perpendicular traffic gets a reservation.
        const outerEdge = crosswalk ? crosswalk.offset+crosswalk.depth/2 : 0;
        routeA.junction={at:stationA+u*routeA.segLens[i],edge:Math.max(routeB.width/2,outerEdge)+HALF_LENGTH};
        routeB.junction={at:stationB+v*routeB.segLens[j],edge:Math.max(routeA.width/2,outerEdge)+HALF_LENGTH};
        return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,
          halfX:routeA.width/2,halfZ:routeB.width/2,crosswalk,owner:null};
      }
      stationB+=routeB.segLens[j];
    }
    stationA+=routeA.segLens[i];
  }
  return null;
}

const stopLine = route => route.junction.edge + 1.55;
const beforeCenter = car => (car.route.junction.at-car.dist)*car.dir;

export function reserveJunction(junction, cars, blocker) {
  if (!junction) return;
  junction.blocked = false;
  if (blocker && !blocker.riding && (blocker.mounted || blocker.y<=2.6)) {
    const x = Math.abs(blocker.x-junction.x);
    const z = Math.abs(blocker.z-junction.z);
    junction.blocked = x<junction.halfX+.7 && z<junction.halfZ+.7;
    if (junction.crosswalk) {
      const {offset,depth,sidewalkApproach} = junction.crosswalk;
      const marked = depth/2+.7;
      junction.blocked ||= (Math.abs(x-offset)<marked && z<junction.halfZ+sidewalkApproach+.7)
        || (Math.abs(z-offset)<marked && x<junction.halfX+sidewalkApproach+.7);
    }
  }
  if (junction.owner && beforeCenter(junction.owner) < -junction.owner.route.junction.edge) junction.owner=null;
  if (junction.owner || junction.blocked) return;

  let best = 16;
  for (const car of cars) {
    if (!car.route.junction) continue;
    const before=beforeCenter(car);
    // A car already in the box clears it before the next approach enters.
    if (before >= -car.route.junction.edge && before < stopLine(car.route)) {
      junction.owner=car;
      return;
    }
    const remaining=before-stopLine(car.route);
    if (remaining >= 0 && remaining < best) {
      junction.owner=car;
      best=remaining;
    }
  }
}

export function junctionGap(junction,car) {
  if (!junction || !car.route.junction) return Infinity;
  const before=beforeCenter(car);
  if (before < -car.route.junction.edge || before > stopLine(car.route)+LOOKAHEAD) return Infinity;
  if (junction.owner===car && (!junction.blocked || before < stopLine(car.route)-.6)) return Infinity;
  return Math.max(0,before-stopLine(car.route));
}
