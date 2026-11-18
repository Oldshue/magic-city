import { MathUtils, Quaternion, Vector3 } from '../../vendor/three.module.min.js';
import { constrainLimb } from './limb-constraint.js';

const up=new Vector3(0,1,0), xAxis=new Vector3(1,0,0);
const handle=new Vector3(.065,.044,0);
const twist=new Quaternion().setFromAxisAngle(up,Math.PI);
const {lerp,smoothstep}=MathUtils;

/** Seat joints meet the booth and cup contacts follow the same cup mesh Ada served. */
export function createCrownGuestPose(body) {
  const pelvis=body.getObjectByName('pelvis');
  const chest=body.getObjectByName('spine_03');
  const head=body.getObjectByName('head');
  const limb=(side,names)=>names.map(name=>body.getObjectByName(name+'_'+side));
  const legs=['l','r'].map(side=>limb(side,['thigh','calf','foot']));
  const arms=['l','r'].map(side=>limb(side,['upperarm','lowerarm','hand']));
  const finger=body.getObjectByName('middle_01_r');
  const bones=[pelvis,chest,head,...legs.flat(),...arms.flat()];
  if (!finger || bones.some(bone=>!bone)) return null;

  const original=bones.map(()=>new Quaternion());
  const baseHip=new Vector3();
  const standingFeet=legs.map(()=>new Vector3());
  const standing=new Vector3(), target=new Vector3(), offset=new Vector3(), pole=new Vector3();
  const cupPoint=new Vector3(), carry=new Vector3(), atTable=new Vector3(), atMouth=new Vector3();
  const palmPoint=new Vector3(), fingerPoint=new Vector3(), handDelta=new Vector3();
  const worldRotation=new Quaternion(), roomInverse=new Quaternion();
  const cupRotation=new Quaternion(), carryRotation=new Quaternion();
  const palmRotation=new Quaternion(), handTurn=new Quaternion(), neutralCup=new Quaternion();
  const fingerGoal=new Vector3();
  let posed=false;

  function restore() {
    if (!posed) return;
    for (let i=0;i<bones.length;i++) bones[i].quaternion.copy(original[i]);
    pelvis.position.copy(baseHip);
    posed=false;
  }

  function setSeat(pose) {
    const seat=pose.seat;
    for (let i=0;i<2;i++) legs[i][2].getWorldPosition(standingFeet[i]);
    pelvis.getWorldPosition(standing);
    body.worldToLocal(standing);
    standing.y=lerp(standing.y,(pose.seatHeight+.065)/body.scale.y,seat);
    standing.z-=.075*seat;
    pelvis.parent.worldToLocal(body.localToWorld(standing));
    pelvis.position.copy(standing);
    chest.rotateX(.105*seat);
    head.rotateX(.11*seat);
    pole.set(0,0,1).transformDirection(body.matrixWorld);
    for (let i=0;i<2;i++) {
      const [thigh,calf,foot]=legs[i];
      const sign=i===0 ? 1 : -1;
      body.localToWorld(target.set(sign*.146,.070/body.scale.y,.357+(i===0 ? .026 : 0)));
      target.lerp(standingFeet[i],1-seat);
      constrainLimb(thigh,calf,foot,target,null,pole);

      const [arm,forearm,wrist]=arms[i];
      body.localToWorld(target.set(sign*.205,(pose.seatHeight+.126)/body.scale.y,.303));
      target.lerp(wrist.getWorldPosition(standing),1-seat);
      constrainLimb(arm,forearm,wrist,target);
    }
  }

  function holdCup(pose) {
    const {cup,mode,amount}=pose, room=cup.parent;
    const reach=mode==='collecting' ? amount : 1;
    room.getWorldQuaternion(neutralCup);
    roomInverse.copy(neutralCup).invert();
    room.localToWorld(atTable.set(...pose.table));

    if (mode==='at the table' && amount<.001) {
      cup.position.set(...pose.table);
      cup.quaternion.identity();
      return;
    }

    body.getWorldQuaternion(worldRotation);
    carryRotation.copy(worldRotation).multiply(twist);
    body.localToWorld(carry.set(-.255,lerp(.995,(pose.seatHeight+.255)/body.scale.y,pose.seat),.272));
    if (mode==='collecting') {
      cup.getWorldPosition(cupPoint);
      cup.getWorldQuaternion(cupRotation);
    } else if (mode==='carry') {
      room.localToWorld(cupPoint.set(...pose.handoff)).lerp(carry,amount);
      cupRotation.copy(neutralCup).slerp(carryRotation,amount);
    } else if (mode==='setting down') {
      cupPoint.copy(carry).lerp(atTable,amount);
      cupRotation.copy(carryRotation).slerp(neutralCup,amount);
    } else {
      head.getWorldPosition(atMouth);
      offset.set(-.031,-.102,.158).applyQuaternion(worldRotation).multiplyScalar(body.scale.y);
      atMouth.add(offset);
      cupPoint.copy(atTable).lerp(atMouth,amount);
      cupRotation.copy(worldRotation)
        .multiply(palmRotation.setFromAxisAngle(xAxis,-.54*smoothstep(amount,.54,1))).multiply(twist);
      cupRotation.slerp(neutralCup,1-amount);
      head.rotateX(.10*amount);
    }

    const [upper,lower,wrist]=arms[1];
    wrist.getWorldPosition(palmPoint);
    finger.getWorldPosition(fingerPoint);
    handDelta.subVectors(fingerPoint,palmPoint);
    fingerGoal.set(0,-.36,.93).transformDirection(body.matrixWorld);
    handTurn.setFromUnitVectors(offset.copy(handDelta).normalize(),fingerGoal);
    wrist.getWorldQuaternion(palmRotation);
    standing.copy(handDelta);
    standing.applyQuaternion(handTurn).multiplyScalar(.44);
    target.copy(handle).applyQuaternion(cupRotation).add(cupPoint).sub(standing);
    target.lerp(palmPoint,1-reach);
    palmRotation.premultiply(handTurn);
    constrainLimb(upper,lower,wrist,target,palmRotation);
    if (mode==='collecting') return;
    palmPoint.copy(wrist.getWorldPosition(standing)).lerp(finger.getWorldPosition(fingerPoint),.44);
    cupPoint.copy(palmPoint).sub(offset.copy(handle).applyQuaternion(cupRotation));
    if (mode==='setting down') cupPoint.lerp(atTable,smoothstep(amount,.84,1));
    cup.position.copy(room.worldToLocal(cupPoint));
    cup.quaternion.copy(roomInverse.multiply(cupRotation));
  }

  return {restore,apply(pose) {
    if (!pose || (!pose.seat && !pose.mode)) return;
    for (let i=0;i<bones.length;i++) original[i].copy(bones[i].quaternion);
    baseHip.copy(pelvis.position);
    posed=true;
    if (pose.seat) setSeat(pose);
    if (pose.mode) holdCup(pose);
  }};
}
