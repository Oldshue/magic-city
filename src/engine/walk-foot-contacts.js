import { MathUtils, Quaternion, Vector3 } from '../../vendor/three.module.min.js';
import { constrainLimb } from './limb-constraint.js';

const sampled = new Vector3();
const wanted = new Vector3();
const orientation = new Quaternion();

export function createWalkFootContacts(asset) {
  const feet = ['l','r'].map((side,index)=>{
    const joints = ['thigh','calf','foot'].map(name=>asset.getObjectByName(name+'_'+side));
    return {
      joints, offset:index*.5, active:false, dirty:false, anchor:new Vector3(), rotation:new Quaternion(),
      original:joints.map(()=>new Quaternion()),
    };
  });

  return {
    restore() {
      for (const foot of feet) {
        if (!foot.dirty) continue;
        foot.joints.forEach((bone,i)=>bone.quaternion.copy(foot.original[i]));
        foot.dirty = false;
      }
    },

    clear() {
      for (const foot of feet) foot.active = false;
    },

    apply(cycle) {
      for (const foot of feet) {
        const phase = (cycle+foot.offset)%1;
        // The authored gait keeps each sole planted during its first 55%.
        if (phase>=.55) {
          foot.active = false;
          continue;
        }
        const [upper,lower,ankle] = foot.joints;
        ankle.getWorldPosition(sampled);
        if (!foot.active || foot.anchor.distanceToSquared(sampled)>.18**2) {
          foot.anchor.copy(sampled);
          ankle.getWorldQuaternion(foot.rotation);
          foot.active = true;
        }
        const weight = MathUtils.smoothstep(phase,0,.10)*(1-MathUtils.smoothstep(phase,.43,.55));
        if (!weight) continue;
        foot.joints.forEach((bone,i)=>foot.original[i].copy(bone.quaternion));
        wanted.copy(sampled).lerp(foot.anchor,weight);
        ankle.getWorldQuaternion(orientation).slerp(foot.rotation,weight);
        constrainLimb(upper,lower,ankle,wanted,orientation);
        foot.dirty = true;
      }
    },
  };
}
