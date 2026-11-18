import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { constrainLimb } from './limb-constraint.js';

const PANELS = 8;
const CROWN = .91;
const RIM = .645;

function canopyPoint(panel,across,along,open) {
  const angle=(panel+across)*Math.PI*2/PANELS;
  const billow=Math.sin(across*Math.PI);
  const radius=open ? along*(RIM-.033*billow*along) : .006+along*(.046+.012*billow);
  const y=open ? CROWN-.227*along**1.72+.019*billow*Math.sin(Math.PI*along)
    : CROWN-along*.740;
  return new THREE.Vector3(Math.cos(angle)*radius,y,Math.sin(angle)*radius);
}

function canopyGeometry(open) {
  const positions=[], colors=[], indices=[];
  const rings=8, segments=8;
  for (let panel=0; panel<PANELS; panel++) {
    const base=positions.length/3;
    for (let row=0; row<=rings; row++) {
      const along=row/rings;
      for (let column=0; column<=segments; column++) {
        const across=column/segments;
        positions.push(...canopyPoint(panel,across,along,open).toArray());
        const seam=column===0 || column===segments;
        const tint=(panel%2 ? .94 : 1.0)+along*.05-(seam ? .15 : 0);
        colors.push(tint,tint,tint);
        if (row===rings || column===segments) continue;
        const i=base+row*(segments+1)+column;
        indices.push(i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribs(open) {
  const parts=[];
  for (let panel=0; panel<PANELS; panel++) {
    const points=[];
    for (let i=0; i<=8; i++) {
      const point=canopyPoint(panel,0,.04+i/8*.96,open);
      point.y-=.014;
      points.push(point);
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.006,5,false));
  }
  const geometry=mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

function canOpen(folded,open) {
  folded.morphAttributes.position=[open.attributes.position];
  folded.morphAttributes.normal=[open.attributes.normal];
  open.dispose();
  folded.computeBoundingSphere();
  return folded;
}

/** Shared eight-rib geometry, with a separate hand contact on each performer. */
export function createUmbrellas(environment) {
  const fabric=canOpen(canopyGeometry(false),canopyGeometry(true));
  const framework=canOpen(ribs(false),ribs(true));
  const metal=new THREE.MeshStandardMaterial({
    color:0x68594b, roughness:.44, metalness:.67, envMap:environment, envMapIntensity:.65,
  });
  const wood=new THREE.MeshStandardMaterial({color:0x4d3022,roughness:.41});
  const shaft=new THREE.CylinderGeometry(.008,.009,.94,10).translate(0,CROWN*.5,0);
  const ferrule=new THREE.CylinderGeometry(.009,.018,.083,10).translate(0,CROWN+.028,0);
  const staff=mergeGeometries([shaft,ferrule]);
  shaft.dispose();
  ferrule.dispose();
  const bend=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,.068,0),new THREE.Vector3(0,-.108,0),new THREE.Vector3(.049,-.151,0),
    new THREE.Vector3(.095,-.125,0),new THREE.Vector3(.105,-.071,0),
  ]);
  const handle=new THREE.TubeGeometry(bend,18,.017,10,false);
  const target=new THREE.Vector3(), wrist=new THREE.Vector3(), finger=new THREE.Vector3();
  const before=new THREE.Vector3(), after=new THREE.Vector3();
  const handRotation=new THREE.Quaternion(), change=new THREE.Quaternion(), adjust=new THREE.Quaternion();
  const { damp, lerp, smoothstep }=THREE.MathUtils;

  return function attach(instance) {
    const bones=['upperarm_r','lowerarm_r','hand_r','middle_01_r'].map(name=>instance.getObjectByName(name));
    if (bones.some(bone=>!bone)) return null;
    const [upper, lower, palm, knuckle]=bones;
    const resting=bones.slice(0,3).map(()=>new THREE.Quaternion());
    const group=new THREE.Group();
    group.name='Walking umbrella';
    const cloth=new THREE.Mesh(fabric,new THREE.MeshStandardMaterial({
      vertexColors:true, side:THREE.DoubleSide, roughness:.56,
      envMap:environment, envMapIntensity:.32,
    }));
    cloth.name='Eight-panel canopy';
    const frame=new THREE.Mesh(framework,metal);
    group.add(cloth,frame,new THREE.Mesh(staff,metal),new THREE.Mesh(handle,wood));
    group.traverse(object=>{
      if (!object.isMesh) return;
      object.castShadow=true;
      object.receiveShadow=true;
    });
    instance.add(group);
    let posing=false, lean=0;

    function restore() {
      if (!posing) return;
      for (let i=0;i<resting.length;i++) bones[i].quaternion.copy(resting[i]);
      posing=false;
    }

    function update(prop,dt) {
      group.visible=Boolean(prop);
      if (!prop) {
        lean=0;
        return;
      }
      const amount=prop.amount;
      const raise=smoothstep(amount,.02,.86);
      const spread=smoothstep(amount,.26,.97);
      cloth.material.color.setHex(prop.color);
      cloth.material.roughness=lerp(.69,.54,spread);
      cloth.morphTargetInfluences[0]=spread;
      frame.morphTargetInfluences[0]=spread;
      group.userData.open=spread;

      palm.getWorldPosition(wrist);
      knuckle.getWorldPosition(finger);
      if (raise>.001) {
        for (let i=0;i<resting.length;i++) resting[i].copy(bones[i].quaternion);
        posing=true;
        upper.getWorldPosition(target);
        instance.worldToLocal(target);
        target.x*=1.25;
        target.y-=.10;
        target.z+=.29;
        instance.localToWorld(target);
        target.lerp(wrist,1-raise);
        before.subVectors(finger,wrist).normalize();
        after.set(0,-.34,.94).transformDirection(instance.matrixWorld);
        change.identity().slerp(adjust.setFromUnitVectors(before,after),raise);
        palm.getWorldQuaternion(handRotation).premultiply(change);
        constrainLimb(upper,lower,palm,target,handRotation);
        palm.getWorldPosition(wrist);
        knuckle.getWorldPosition(finger);
      }
      wrist.lerp(finger,.49);
      group.position.copy(instance.worldToLocal(wrist));
      lean=damp(lean,raise,8,dt);
      group.rotation.set(lerp(2.13,-.13,lean),.10,lerp(.20,-.14,lean));
    }

    return {restore,update};
  };
}
