import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../engine/deco-shared.js';

const MOUNT_HEIGHT = 3.25;
const EAVE_HEIGHT = 2.80;
const WALL_EDGE = .18;
const PROJECTION = 2.30;
const COLORS = {
  lunch:['#5b2b29','#c2a67e','#9c6846'],
  chemist:['#284447','#bfae8d','#7c8b6a'],
};

function canvasMaterial(kind) {
  const [dark, neutral, piping] = COLORS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 160;
  const paint = canvas.getContext('2d');
  paint.fillStyle = dark;
  paint.fillRect(0,0,192,160);
  paint.fillStyle = neutral;
  paint.fillRect(67,0,58,160);
  paint.fillStyle = piping;
  for (const x of [57,62,128,133]) paint.fillRect(x,0,2,160);
  for (let y=0; y<160; y+=2) {
    paint.fillStyle = y%6===0 ? 'rgba(255,246,222,.065)' : 'rgba(23,19,13,.07)';
    paint.fillRect(0,y,192,1);
  }
  for (let x=1; x<192; x+=3) {
    paint.fillStyle = x%2 ? 'rgba(255,245,212,.06)' : 'rgba(12,16,14,.06)';
    paint.fillRect(x,0,1,160);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({map:texture, roughness:.83, side:THREE.DoubleSide});
}

function sewnCanvas(halfWidth, repeats) {
  const segments = repeats*8;
  const rows = 8;
  const positions = [], uv = [], index = [];
  for (let row=0; row<=rows+1; row++) {
    const depth = Math.min(1,row/rows);
    for (let column=0; column<=segments; column++) {
      const across = column/segments;
      const ripple = Math.cos(across*repeats*4*Math.PI);
      const lip = row>rows;
      const swell = Math.sin(depth*Math.PI)*(.068 + .019*ripple);
      const at = MOUNT_HEIGHT + (EAVE_HEIGHT-MOUNT_HEIGHT)*depth + swell;
      positions.push((2*across-1)*halfWidth, at - (lip ? .15+.038*ripple : 0),
        WALL_EDGE + (PROJECTION-WALL_EDGE)*depth + (lip ? .014 : 0));
      uv.push(across*repeats,lip ? .03 : .96-depth*.70);
      if (row<rows+1 && column<segments) {
        const a = row*(segments+1)+column, b = a+segments+1;
        index.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  // Canvas returns close the sides and make the slope legible from the sidewalk.
  for (const side of [-1,1]) {
    const base=positions.length/3;
    for (let row=0; row<=rows; row++) {
      const depth=row/rows;
      const upper=MOUNT_HEIGHT+(EAVE_HEIGHT-MOUNT_HEIGHT)*depth + Math.sin(depth*Math.PI)*.086;
      const edge=WALL_EDGE+(PROJECTION-WALL_EDGE)*depth;
      const lower=upper-(.34-.18*depth);
      positions.push(side*halfWidth,upper,edge,side*halfWidth,lower,edge);
      uv.push(depth*3,.78,depth*3,.04);
      if (row<rows) {
        const a=base+row*2;
        if (side<0) index.push(a,a+1,a+2,a+1,a+3,a+2);
        else index.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function awningFrame(halfWidth, material) {
  const parts = [];
  const y = new THREE.Vector3(0,1,0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  function rod(x, ay, az, by, bz, radius) {
    a.set(x,ay,az);
    b.set(x,by,bz);
    delta.subVectors(b,a);
    const bar = new THREE.CylinderGeometry(radius,radius,delta.length(),10);
    rotation.setFromUnitVectors(y,delta.normalize());
    a.lerp(b,.5);
    parts.push(bar.applyQuaternion(rotation).translate(a.x,a.y,a.z));
  }
  for (const x of [-halfWidth+.19,0,halfWidth-.19]) {
    rod(x,MOUNT_HEIGHT-.48,.15,EAVE_HEIGHT-.017,PROJECTION-.032,.018);
    parts.push(new THREE.BoxGeometry(.092,.26,.056).translate(x,MOUNT_HEIGHT-.38,.14));
    parts.push(new THREE.SphereGeometry(.032,10,8).translate(x,EAVE_HEIGHT-.02,PROJECTION-.024));
  }
  for (const [height,depth] of [[MOUNT_HEIGHT,WALL_EDGE],[EAVE_HEIGHT,PROJECTION]]) {
    parts.push(new THREE.CylinderGeometry(.025,.025,2*halfWidth+.095,10)
      .rotateZ(Math.PI/2).translate(0,height,depth));
  }
  const frame = new THREE.Mesh(mergeGeometries(parts),material);
  for (const part of parts) part.dispose();
  return frame;
}

/** The same cloth footprint supplies the dry area and the two waiting bays. */
export function addStorefrontAwning(shop, kind, width, roomDepth, material) {
  const halfWidth = Math.min(width/2-.33,3.88);
  const group = new THREE.Group();
  group.name = kind==='lunch' ? 'Crown canvas awning' : 'Drugstore canvas awning';
  group.add(new THREE.Mesh(sewnCanvas(halfWidth,16),canvasMaterial(kind)),awningFrame(halfWidth,material));
  shop.add(group);
  const wall = shop.getWorldPosition(new THREE.Vector3());
  const side = Math.sign(wall.x);
  const shelter = {
    kind, side, wallX:wall.x, z:wall.z, halfWidth, projection:PROJECTION, start:WALL_EDGE,
    wallY:wall.y+MOUNT_HEIGHT, eaveY:wall.y+EAVE_HEIGHT, roomHalfWidth:width/2, roomDepth,
    roomY:wall.y+4.19, eaveX:wall.x-side*PROJECTION,
    bays:[2.57,-2.52].map(offset=>new THREE.Vector3(wall.x-side*1.30,wall.y,wall.z+offset)),
  };
  group.userData.shelter = shelter;
  return shelter;
}
