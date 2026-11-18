import { CubicBezierCurve3, LineCurve3, MathUtils, Vector3 } from '../../vendor/three.module.min.js';

const CURB_CLEARANCE = 1.60;
const ACCELERATION = 2.7;

const point = (x,z)=>new Vector3(x,0,z);

/** Each arm has two footpaths within its painted width. */
function crossingStroke(crossing, direction) {
  const length = crossing.halfSpan+CURB_CLEARANCE;
  const offset = direction*.53;
  const {x,z,axis,id} = crossing;
  const from = axis==='x' ? point(x-direction*length,z+offset) : point(x-offset,z-direction*length);
  const to = axis==='x' ? point(x+direction*length,z+offset) : point(x-offset,z+direction*length);
  return {curve:new LineCurve3(from,to),crosswalk:id};
}

function turn(from,to,longTurn=false) {
  const start=from.curve.v2, end=to.curve.v1;
  const reach=longTurn ? 3.05 : Math.min(2.46,start.distanceTo(end)*.54);
  const ahead=from.curve.getTangent(1).multiplyScalar(reach).add(start);
  const behind=to.curve.getTangent(0).multiplyScalar(-reach).add(end);
  return {curve:new CubicBezierCurve3(start,ahead,behind,end),turning:true};
}

/** Follow sidewalks past the shop doors, around the intersection, and back to Morris. */
export function sidewalkCircuit(crossings,side) {
  const bySide=new Map(crossings.map(crossing=>[crossing.id,crossing]));
  if (!['east','west','north','south'].every(id=>bySide.has(id))) return null;
  const lane=bySide.get('north').halfSpan+2;
  const south=48.25;
  const north=17.55;
  const first=side>0 ? 'east' : 'west';
  const opposite=side>0 ? 'west' : 'east';
  const lines=[
    {curve:new LineCurve3(point(lane*side,south),point(lane*side,north)),shopfront:true},
    crossingStroke(bySide.get(first),-1),
    crossingStroke(bySide.get('north'),-side),
    crossingStroke(bySide.get(opposite),1),
    crossingStroke(bySide.get('south'),side),
    {curve:new LineCurve3(point((lane+2.23)*side,north+.08),point((lane+2.23)*side,south))},
  ];
  const legs=lines.flatMap((line,i)=>[line,turn(line,lines[(i+1)%lines.length],i===lines.length-1)]);
  for (const leg of legs) leg.length=leg.curve.getLength();
  return {legs,laneX:lane*side};
}

export function createSidewalkWalker(circuit,cruise,{z,before}={}) {
  const {legs}=circuit;
  const pose={point:new Vector3(),heading:Math.PI,activity:'walking',crosswalk:null,wait:0,speed:cruise};
  const request={x:0,z:0,y:1.7,crosswalk:null,active:false,committed:false};
  const tangent=new Vector3(), ahead=new Vector3();
  let index=0, distance=0;

  function locate() {
    const {curve,length}=legs[index];
    const t=curve.getUtoTmapping(distance/length);
    curve.getPoint(t,pose.point);
    curve.getTangent(t,tangent);
    pose.heading=Math.atan2(tangent.x,tangent.z);
    request.x=pose.point.x;
    request.z=pose.point.z;
  }

  function resumeShopfront(z) {
    index=0;
    distance=MathUtils.clamp(legs[0].curve.v1.z-z,0,legs[0].length);
    pose.speed=cruise;
    locate();
  }

  if (before) {
    const crossingIndex=legs.findIndex(leg=>leg.crosswalk===before);
    index=Math.max(0,crossingIndex-1);
    distance=Math.max(0,legs[index].length-1.58);
    locate();
  } else {
    resumeShopfront(z ?? legs[0].curve.v1.z);
  }

  function step(dt,traffic,following) {
    const leg=legs[index], next=legs[(index+1)%legs.length];
    const {crosswalk,curve,length}=leg;
    pose.crosswalk=crosswalk ?? null;
    if (crosswalk && !request.committed) {
      request.crosswalk=crosswalk;
      request.active=true;
      if (traffic && !traffic.canCross(request)) {
        pose.activity='waiting to cross';
        pose.wait+=dt;
        pose.speed=0;
        return pose;
      }
      request.committed=true;
    }
    pose.activity=crosswalk ? 'crossing' : leg.turning ? 'rounding the corner' : 'walking';
    const remaining=length-distance;
    let target=crosswalk ? cruise*1.10 : cruise;
    if (next.crosswalk) target=Math.min(target,Math.sqrt(2*ACCELERATION*remaining));
    if (!crosswalk && following) {
      curve.getPointAt(Math.min(1,(distance+.64)/length),ahead);
      if (following(ahead.x,ahead.z,pose.heading)) target=0;
    }
    const change=MathUtils.clamp(target-pose.speed,-ACCELERATION*dt,ACCELERATION*dt);
    const travel=(pose.speed+change*.5)*dt;
    const nextDistance=Math.min(length,distance+travel);
    if (crosswalk && traffic?.canStepInCrossing) {
      curve.getPointAt(nextDistance/length,ahead);
      if (!traffic.canStepInCrossing(ahead.x,ahead.z)) {
        pose.speed=0;
        pose.wait+=dt;
        return pose;
      }
    }
    pose.wait=0;
    pose.speed+=change;
    distance=nextDistance;
    locate();
    if (remaining>travel) return pose;

    if (crosswalk) {
      request.active=false;
      request.committed=false;
    }
    if (next.crosswalk) {
      request.crosswalk=next.crosswalk;
      request.active=true;
      pose.speed=0;
    }
    index=(index+1)%legs.length;
    distance=0;
    return pose;
  }

  return {pose, request, step, resumeShopfront, get onShopfront(){return legs[index].shopfront===true;}};
}
