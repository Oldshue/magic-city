import * as THREE from '../../vendor/three.module.min.js';
import { createStorefrontWalk } from './sidewalk-circuit.mjs';

const REGISTER = [-.73,-1.735];
const LINE = [[1.17,-1.68],[1.80,-.97]];
const DOWN_CUP = .67;
const START = [[-.38,1.48],[-2.24,3.95]];
const GUESTS = [
  {id:'crown-clerk',model:'bank-clerk',scale:.99,palette:2,pause:17.5},
  {id:'crown-mechanic',model:'street-worker',scale:1.04,palette:5,pause:23.4},
];

function point([x,z]) {
  return new THREE.Vector3(x,0,z);
}

/** Regulars share Ada's urn and use the two booths already in the room. */
export function startCrownPatrons(ctx) {
  const counter=ctx.shopCounters?.find(shop=>shop.kind==='lunch');
  const server=ctx.counterService;
  if (!server || !counter?.service.booths?.length) return null;
  const {shop,service}=counter;
  const {damp,lerp,smoothstep,radToDeg}=THREE.MathUtils;
  const eye=new THREE.Vector3(), world=new THREE.Vector3();
  const facing=shop.getWorldQuaternion(new THREE.Quaternion());
  const roomYaw=new THREE.Euler().setFromQuaternion(facing,'YXZ').y;
  const floor=shop.getWorldPosition(world).y;
  const queue=[];
  const bodies=[];
  let atRegister=null;
  ctx.controls.addMovingColliders?.(bodies);

  const patrons=GUESTS.map((config,index)=>{
    const booth=service.booths[index];
    const at=point(START[index]);
    shop.localToWorld(world.copy(at));
    const drink=service.patronCup(config.id+' coffee');
    const dining={
      cup:drink.group, table:booth.cup, seatHeight:booth.seat[1], seat:0,
      mode:'', amount:0, handoff:drink.edge,
    };
    const actor={...config,position:[world.x,world.z],yawDeg:radToDeg(roomYaw),
      groundY:floor,activity:'outside the Crown',dining,moving:false,speed:0};
    ctx.characters.push(actor);
    const pose={point:at,heading:0,speed:.85};
    return {index,booth,actor,pose,drink,walk:createStorefrontWalk(pose),time:0,
      facing:0,next:null,pace:1.13+index*.07,carrying:0,body:{}};
  });

  function activity(patron,name) {
    patron.actor.activity=name;
    patron.time=0;
  }

  function move(patron,name,points,then,pace=patron.pace) {
    const nodes=[patron.pose.point.clone(),...points.map(point)];
    const curve=nodes.length===2 ? new THREE.LineCurve3(...nodes) : new THREE.CatmullRomCurve3(nodes);
    patron.walk.begin(curve,true);
    patron.next=then;
    patron.targetPace=pace;
    activity(patron,name);
  }

  function admit(patron) {
    if (!queue.length && !atRegister && server.canServePatron(counter)) {
      goToCounter(patron);
      return;
    }
    const place=LINE.find(slot=>queue.every(guest=>guest.linePlace!==slot));
    patron.linePlace=place;
    queue.push(patron);
    move(patron,'joining the line',[[.29,-1.15],[.72,-1.45],place],wait);
  }

  function wait(patron) {
    activity(patron,'waiting in line');
  }

  function arrive(patron) {
    const lateral=patron.pose.point.x;
    const points=Math.abs(lateral)>5
      ? [[lateral*.49,3.65],[lateral*.09,1.71],[0,.63],[0,-.82]]
      : [[lateral*.46,1.41],[-.055,.62],[0,-.82]].filter(([x,z])=>z<patron.pose.point.z-.12);
    move(patron,'entering the Crown',points,admit);
  }

  function goToCounter(patron) {
    if (queue[0]===patron) queue.shift();
    patron.linePlace=null;
    atRegister=patron;
    move(patron,'walking to the register',[[.20,-1.38],[-.28,-1.69],REGISTER],
      guest=>activity(guest,'at the register'),1.03);
  }

  function carryToBooth(patron) {
    if (!server.finishPatron(counter,patron.drink)) return;
    const [x,,z]=patron.booth.aisle;
    patron.actor.dining.mode='carry';
    patron.carrying=0;
    atRegister=null;
    const turns=patron.index===0
      ? [[-1.42,-1.65],[-2.12,-1.73],[x,z]]
      : [[.10,-1.54],[1.36,-1.24],[x,z]];
    move(patron,'taking coffee to a booth',turns,guest=>activity(guest,'sitting down'),.95);
  }

  function moveInBooth(patron,amount) {
    const {seat,aisle,yaw}=patron.booth;
    const blend=smoothstep(amount,0,1);
    patron.pose.point.set(lerp(aisle[0],seat[0],blend),0,lerp(aisle[2],seat[2],blend));
    patron.pose.heading=yaw;
    patron.actor.dining.seat=smoothstep(amount,.03,1);
  }

  function seated(patron) {
    const dining=patron.actor.dining;
    if (patron.time<DOWN_CUP) {
      dining.mode='setting down';
      dining.amount=smoothstep(patron.time,0,DOWN_CUP);
      return;
    }
    const t=patron.time-DOWN_CUP;
    const first=smoothstep(t,1.05,1.69)*(1-smoothstep(t,2.11,2.77));
    const second=smoothstep(t,5.1,5.73)*(1-smoothstep(t,6.15,6.81));
    dining.mode='at the table';
    dining.amount=first+second;
    patron.drink.filled.scale.y=1-.37*smoothstep(t,1.63,2.15)-.43*smoothstep(t,5.63,6.22);
    if (t>10.7+patron.index*.62) activity(patron,'getting up');
  }

  function leave(patron) {
    const side=patron.index===0 ? 1 : -1;
    const [x,,z]=patron.booth.aisle;
    patron.actor.dining.mode='';
    patron.actor.dining.amount=0;
    const path=[[x,-1.31],[x*.53,-1.15],[.06,-.79],[0,.68],[side*.83,2.75],
      [side*3.23,4.43],[side*(9.9+patron.index*1.6),5.12]];
    if (z>-1.32) path.shift();
    move(patron,'leaving the Crown',path,guest=>activity(guest,'back on 20th Street'));
  }

  function atRest(patron) {
    const actor=patron.actor, dining=actor.dining;
    switch (actor.activity) {
      case 'waiting in line':
        patron.pose.heading=-2.76;
        if (!atRegister && queue[0]===patron && server.canServePatron(counter)) goToCounter(patron);
        break;
      case 'at the register':
        patron.pose.heading=Math.PI;
        if (server.servePatron(counter,patron.drink)) {
          dining.mode='';
          activity(patron,'waiting for coffee');
        }
        break;
      case 'waiting for coffee':
        if (server.patronReady(counter,patron.drink)) {
          dining.mode='collecting';
          dining.amount=0;
          activity(patron,'collecting coffee');
        }
        break;
      case 'collecting coffee':
        dining.amount=smoothstep(patron.time,0,.46);
        if (patron.time>.56) carryToBooth(patron);
        break;
      case 'sitting down':
        moveInBooth(patron,Math.min(1,patron.time/.92));
        if (patron.time>=.92) activity(patron,'having coffee');
        break;
      case 'having coffee':
        seated(patron);
        break;
      case 'getting up':
        moveInBooth(patron,1-Math.min(1,patron.time/.94));
        if (patron.time>=.94) leave(patron);
        break;
      case 'back on 20th Street':
        if (patron.time>actor.pause) arrive(patron);
        break;
    }
  }

  function blocked(patron,x,z) {
    const indoors=z<-.32;
    const reach=indoors ? .58 : .66;
    if (eye.y>.4 && eye.y<2.3 && Math.hypot(eye.x-x,eye.z-z)<reach) return true;
    return patrons.some(other=>other!==patron
      && Math.hypot(other.pose.point.x-x,other.pose.point.z-z)<.60);
  }

  for (const patron of patrons) {
    patron.blocked=(x,z)=>blocked(patron,x,z);
    arrive(patron);
  }

  return {update(dt) {
    shop.worldToLocal(eye.copy(ctx.camera.position));
    bodies.length=0;
    for (const patron of patrons) {
      const {actor,pose}=patron;
      const dining=actor.dining;
      patron.time+=dt;
      if (patron.next) {
        if (patron.walk.step(dt,patron.targetPace,patron.blocked)) {
          const visit=patron.next;
          patron.next=null;
          pose.speed=0;
          visit(patron);
        }
      } else atRest(patron);
      if (dining.mode==='carry') {
        patron.carrying+=dt;
        dining.amount=smoothstep(patron.carrying,0,.39);
      }

      const turn=Math.atan2(Math.sin(pose.heading-patron.facing),Math.cos(pose.heading-patron.facing));
      patron.facing=damp(patron.facing,patron.facing+turn,10,dt);
      shop.localToWorld(world.copy(pose.point));
      actor.position[0]=world.x;
      actor.position[1]=world.z;
      actor.yawDeg=radToDeg(roomYaw+patron.facing);
      actor.speed=pose.speed;
      actor.moving=Boolean(patron.next && pose.speed>.06);

      // The queue is solid at its stops, with the central doorway kept open.
      if (!actor.moving && pose.point.z < -1.12 && Math.abs(pose.point.x)>.65 && dining.seat<.15) {
        Object.assign(patron.body,{minX:world.x-.17,maxX:world.x+.17,minZ:world.z-.18,maxZ:world.z+.18});
        bodies.push(patron.body);
      }
    }
  }};
}
