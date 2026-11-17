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

    apply(cycle,floor,heightAt) {
      for (const foot of feet) {
        const phase = (cycle+foot.offset)%1;
        // The authored gait keeps each sole planted during its first 55%.
        const planted=phase<.55;
        const [upper,lower,ankle] = foot.joints;
        ankle.getWorldPosition(sampled);
        const difference=heightAt ? heightAt(sampled.x,sampled.z)-floor : 0;
        wanted.copy(sampled);
        wanted.y+=difference;
        let weight=0;
        if (planted) {
          const drift=Math.hypot(foot.anchor.x-sampled.x,foot.anchor.z-sampled.z);
          if (!foot.active || drift>.18) {
            foot.anchor.copy(wanted);
            ankle.getWorldQuaternion(foot.rotation);
            foot.active=true;
          }
          weight=MathUtils.smoothstep(phase,0,.10)*(1-MathUtils.smoothstep(phase,.43,.55));
          wanted.lerp(foot.anchor,weight);
        } else {
          foot.active=false;
        }
        if (!weight && Math.abs(difference)<.0005) continue;
        foot.joints.forEach((bone,i)=>foot.original[i].copy(bone.quaternion));
        ankle.getWorldQuaternion(orientation).slerp(foot.rotation,weight);
        constrainLimb(upper,lower,ankle,wanted,orientation);
        foot.dirty = true;
      }
    },
  };
}
