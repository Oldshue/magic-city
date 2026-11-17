import { HALF_LENGTH, HALF_WIDTH } from './vehicle-motion.mjs';

const BRAKING = 4.2;
const ACCELERATION = 2.25;
const YIELD_MARGIN = .95;
const LOOKAHEAD = 27;

export const HEAVIEST_CORNER_CROSSWALK = Object.freeze({
  offset:14.5, depth:3.4, sidewalkApproach:3,
});

/** The painted crossing, pedestrian route and clearance use the same bounds. */
export function cornerCrosswalks(x,z,width20th,widthFirst,style=HEAVIEST_CORNER_CROSSWALK) {
  if (!style || !(width20th>0 && widthFirst>0)) return [];
  const {offset,depth,sidewalkApproach}=style;
  return [
    ['south','x',x,z+offset,width20th/2], ['north','x',x,z-offset,width20th/2],
    ['east','z',x+offset,z,widthFirst/2], ['west','z',x-offset,z,widthFirst/2],
  ].map(([id,axis,x,z,halfSpan])=>{
    const halfX=axis==='x' ? halfSpan : depth/2;
    const halfZ=axis==='z' ? halfSpan : depth/2;
    const road={minX:x-halfX,minZ:z-halfZ,maxX:x+halfX,maxZ:z+halfZ};
    return {id,axis,x,z,halfSpan,depth,sidewalkApproach,road};
  });
}

export function wrapDistance(value, length) {
  return ((value % length) + length) % length;
}

export function lanePosition(x, z, heading, offset) {
  return [x - Math.cos(heading)*offset, z + Math.sin(heading)*offset];
}

/** Distance to a pedestrian or car in the lane ahead, measured bumper to bumper. */
export function blockerGap(car, blocker, clearingJunction = false) {
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
  // A car already inside the junction can clear it when the walker is
  // outside its swept lane. Other traffic retains the approach margin.
  const margin = clearingJunction && !blocker.mounted ? 0 : .20;
  if (across >= HALF_WIDTH + width + margin) return Infinity;
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
        const x=a.x+(b.x-a.x)*u, z=a.z+(b.z-a.z)*u;
        const crossings=cornerCrosswalks(x,z,routeA.width,routeB.width,crosswalk ?? null);
        for (const crossing of crossings) {
          crossing.route=crossing.axis==='x' ? routeA : routeB;
          crossing.requested=false;
        }
        return {x,z,halfX:routeA.width/2,halfZ:routeB.width/2,crossings,owner:null};
      }
      stationB+=routeB.segLens[j];
    }
    stationA+=routeA.segLens[i];
  }
  return null;
}

const stopLine = route => route.junction.edge + 1.55;
const beforeCenter = car => (car.route.junction.at-car.dist)*car.dir;

function atCrosswalk(crossing,visitor) {
  const dx=Math.abs(visitor.x-crossing.x), dz=Math.abs(visitor.z-crossing.z);
  const across=crossing.axis==='x' ? dx : dz;
  const along=crossing.axis==='x' ? dz : dx;
  return along<crossing.depth/2+.7 && across<crossing.halfSpan+crossing.sidewalkApproach+.7;
}

function atJunction(junction,visitor) {
  if (!visitor || visitor.riding || !(visitor.mounted || visitor.y<=2.6)) return false;
  const x=Math.abs(visitor.x-junction.x), z=Math.abs(visitor.z-junction.z);
  return (x<junction.halfX+.7 && z<junction.halfZ+.7)
    || junction.crossings.some(crossing=>atCrosswalk(crossing,visitor));
}

const hasCrossingRequest = (junction,route)=>junction.crossings.some(c=>c.requested && c.route===route);

/** Cars with a live right-of-way clear before a pedestrian steps down. */
export function canEnterCrosswalk(junction,id,obstacles=[]) {
  if (!junction) return true;
  const crossing=junction.crossings.find(crossing=>crossing.id===id);
  if (!crossing?.requested) return false;
  const owner=junction.owner;
  if (owner?.route===crossing.route && !Number.isFinite(junctionGap(junction,owner))) return false;
  const road=crossing.road;
  return !obstacles.some(box=>box.minX<road.maxX && box.maxX>road.minX
    && box.minZ<road.maxZ && box.maxZ>road.minZ);
}

export function reserveJunction(junction, cars, blocker, pedestrians = []) {
  if (!junction) return;
  junction.blocked = atJunction(junction,blocker);
  for (const crossing of junction.crossings) {
    crossing.requested=pedestrians.some(person=>(!person.crosswalk || person.crosswalk===crossing.id)
      && atCrosswalk(crossing,person));
  }
  if (junction.owner && beforeCenter(junction.owner) < -junction.owner.route.junction.edge) junction.owner=null;
  if (junction.owner && hasCrossingRequest(junction,junction.owner.route)
      && beforeCenter(junction.owner)>=stopLine(junction.owner.route)-.6) junction.owner=null;
  if (junction.owner || junction.blocked) return;

  let best = 16;
  for (const car of cars) {
    if (!car.route.junction) continue;
    const before=beforeCenter(car);
    const halt=stopLine(car.route);
    const yielding=hasCrossingRequest(junction,car.route);
    // A committed car clears the box before admitting another approach.
    if (before >= -car.route.junction.edge && before < halt-(yielding ? .6 : 0)) {
      junction.owner=car;
      return;
    }
    if (yielding) continue;
    const remaining=before-halt;
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
  const stoppedForCrossing = junction.blocked || hasCrossingRequest(junction,car.route);
  if (junction.owner===car && (!stoppedForCrossing || before < stopLine(car.route)-.6)) return Infinity;
  return Math.max(0,before-stopLine(car.route));
}
