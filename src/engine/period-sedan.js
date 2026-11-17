import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from './deco-shared.js';

const PROFILE = [
  [-0.88, 0], [-0.98, 0.07], [-1, 0.26], [-1, 0.68], [-0.93, 0.90],
  [-0.68, 0.99], [0, 1], [0.68, 0.99], [0.93, 0.90], [1, 0.68],
  [1, 0.26], [0.98, 0.07], [0.88, 0],
].reverse();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

function loft(rings) {
  const positions = [];
  const indices = [];
  const stride = PROFILE.length;
  for (const [z, width, bottom, top] of rings) {
    for (const [x, y] of PROFILE) positions.push(x * width, bottom + (top - bottom) * y, z);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < stride; i++) {
      const a = ring * stride + i;
      const b = ring * stride + (i + 1) % stride;
      indices.push(a, b, a + stride, b, b + stride, a + stride);
    }
  }
  for (let i = 1; i < stride - 1; i++) {
    const far = (rings.length - 1) * stride;
    indices.push(0, i + 1, i, far, far + i, far + i + 1);
  }
  return surface(positions, indices);
}

function surface(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function fender(x, centerZ) {
  const positions = [];
  const indices = [];
  const section = [[-0.22, 0.465], [-0.20, 0.51], [-0.09, 0.54], [0.09, 0.54], [0.20, 0.51], [0.22, 0.465]];
  for (let i = 0; i <= 22; i++) {
    const angle = -0.19 + (Math.PI + 0.38) * i / 22;
    for (const [offset, radius] of section) {
      positions.push(x + offset, 0.39 + Math.sin(angle) * radius, centerZ + Math.cos(angle) * radius * 1.13);
    }
    if (i === 0) continue;
    for (let j = 0; j < section.length - 1; j++) {
      const a = (i - 1) * section.length + j;
      const b = a + section.length;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return surface(positions, indices);
}

function bar(from, to, radius, sides = 7) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, direction.normalize()));
  a.lerp(b, 0.5);
  return geometry.translate(a.x, a.y, a.z);
}

function box(x, y, z, width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

function panel(corners) {
  return surface(corners.flat(), [0, 1, 2, 0, 2, 3]);
}

function pane(target, trim, corners) {
  target.push(panel(corners));
  for (let i = 0; i < corners.length; i++) {
    trim.push(bar(corners[i], corners[(i + 1) % corners.length], 0.026));
  }
}

function batch(parent, pieces, material, castsShadow = true) {
  if (!pieces.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
  for (const geometry of pieces) geometry.dispose();
  mesh.castShadow = castsShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

const TYRE_RADIUS = 0.385;
export { TYRE_RADIUS };

function buildWheel(side, z, materials, whitewall) {
  const holder = new THREE.Group();
  holder.position.set(side * 0.89, TYRE_RADIUS, z);
  const roll = new THREE.Group();
  holder.add(roll);
  const tyreSection = [
    [0.268, -0.103], [0.322, -0.115], [0.363, -0.098], [0.382, -0.067],
    [TYRE_RADIUS, -0.046], [TYRE_RADIUS, 0.046], [0.382, 0.067], [0.363, 0.098],
    [0.322, 0.115], [0.268, 0.103], [0.268, -0.103],
  ];
  const tyre = new THREE.LatheGeometry(tyreSection.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  tyre.rotateZ(-Math.PI / 2);
  batch(roll, [tyre], materials.rubber);
  const trim = [];
  const hub = [];
  for (const x of [0.107, -0.107]) {
    const ring = new THREE.TorusGeometry(0.268, 0.013, 7, 32);
    ring.rotateY(Math.PI / 2);
    trim.push(ring.translate(x, 0, 0));
  }
  if (whitewall) {
    const ring = new THREE.RingGeometry(0.281, 0.344, 32);
    ring.rotateY(side * Math.PI / 2);
    batch(roll, [ring.translate(side * 0.114, 0, 0)], materials.whitewall, false);
  }
  for (let i = 0; i < 14; i++) {
    const angle = i * Math.PI * 2 / 14;
    const lip = [side * 0.098, Math.cos(angle) * 0.255, Math.sin(angle) * 0.255];
    const next = angle + (i % 2 ? 0.55 : -0.55);
    trim.push(bar([side * (i % 2 ? 0.138 : 0.106), Math.cos(next) * 0.06, Math.sin(next) * 0.06], lip, 0.009, 5));
  }
  const center = new THREE.SphereGeometry(0.075, 14, 8);
  center.scale(0.44, 1, 1);
  hub.push(center.translate(side * 0.124, 0, 0));
  batch(roll, trim.concat(hub), materials.metal);
  return { holder, roll, front: z > 0 };
}


let clothGrain;
function seatFabric() {
  if (!clothGrain) {
    const size = 48, pixels = new Uint8Array(size * size * 4);
    for (let y=0;y<size;y++) {
      for (let x=0;x<size;x++) {
        const ridge = Math.cos(x*Math.PI/2)*6 + Math.cos(y*Math.PI/2)*6;
        const tone = 173 + ridge + ((x*73+y*37+x*y*13)%19);
        const i = (y*size+x)*4;
        pixels.set([tone,tone,tone,255],i);
      }
    }
    clothGrain = new THREE.DataTexture(pixels,size,size);
    clothGrain.wrapS = clothGrain.wrapT = THREE.RepeatWrapping;
    clothGrain.magFilter = THREE.LinearFilter;
    clothGrain.minFilter = THREE.LinearMipmapLinearFilter;
    clothGrain.generateMipmaps = true;
    clothGrain.anisotropy = 4;
    clothGrain.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({
    color:0x846953, bumpMap:clothGrain, bumpScale:.009, roughness:.92,
  });
}

function upholsteredBenches() {
  const broadcloth = [], welt = [];
  for (const [z,width] of [[-.45,.62],[-1.70,.665]]) {
    broadcloth.push(
      loft([[z-.003,width*.9,.74,.92],[z+.043,width,.75,.933],
        [z+.49,width,.75,.932],[z+.57,width*.97,.773,.882]]),
      loft([[z-.098,width*.91,.79,1.17],[z-.048,width,.80,1.252],
        [z+.079,width,.805,1.255],[z+.126,width*.97,.804,1.213],
        [z+.158,width*.92,.82,1.139]]),
    );
    for (const x of [-.44,-.22,0,.22,.44]) {
      welt.push(bar([x,.938,z+.17],[x,.936,z+.501],.0035,5));
      welt.push(bar([x,.874,z+.162],[x,1.15,z+.135],.0045,6));
    }
    welt.push(bar([-width*.91,.891,z+.558],[width*.91,.891,z+.558],.008,8));
  }
  for (const geometry of broadcloth) {
    const {position,uv} = geometry.attributes;
    for (let i=0;i<position.count;i++) {
      uv.setXY(i,position.getX(i)*7,(position.getY(i)+position.getZ(i))*7);
    }
  }
  return {broadcloth,welt};
}

export function buildPeriodSedan(bodyColor, environment, {whitewall = false, powered = true} = {}) {
  const group = new THREE.Group();
  group.name = 'Period sedan';
  const paint = new THREE.MeshPhysicalMaterial({
    color: bodyColor, roughness: 0.32, metalness: 0.32, clearcoat: 0.55,
    clearcoatRoughness: 0.27, envMap: environment, envMapIntensity: 0.75,
  });
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0x171b1b, roughness: 0.32, metalness: 0.28, clearcoat: 0.52,
    clearcoatRoughness: 0.31, side: THREE.DoubleSide, envMap: environment, envMapIntensity: 0.65,
  });
  const metal = new THREE.MeshStandardMaterial({color:0xc6beac, roughness:0.26, metalness:0.87, envMap:environment});
  const rubber = new THREE.MeshStandardMaterial({color:0x292725, roughness:0.88});
  const whitewallMaterial = new THREE.MeshStandardMaterial({color:0xc7bda3, roughness:0.86});
  const roofMaterial = new THREE.MeshStandardMaterial({color:0x252525, roughness:0.93});
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color:0xa5bcc3, opacity:0.29, roughness:0.23, metalness:0.20, clearcoat:0.7,
    transparent:true, depthWrite:false, side:THREE.DoubleSide, envMap:environment, envMapIntensity:0.8,
  });
  const headlightMat = new THREE.MeshStandardMaterial({color:0xe3d3b4, emissive:0xffdb9f, roughness:0.36, emissiveIntensity:0.22});
  const stopLightMat = new THREE.MeshStandardMaterial({color:0x681511, emissive:0xd83618, roughness:0.31, emissiveIntensity:0});
  // Separate the rear quarter, footwell and cowl so the front doors open
  // into a real cabin. The rocker stays below the doorway.
  const body = [
    loft([[-2.24,0.63,0.57,0.99],[-2.19,0.72,0.52,1.04],[-1.93,0.83,0.49,1.06],[-0.67,0.84,0.49,1.08]]),
    loft([[-0.675,0.83,0.49,0.57],[0.353,0.775,0.50,0.58]]),
    loft([[0.354,0.776,0.50,1.10],[0.48,0.72,0.54,1.10]]),
    loft([[0.22,0.65,0.55,1.15],[0.38,0.66,0.53,1.14],[1.10,0.57,0.55,1.09],[1.98,0.47,0.58,1.055],[2.07,0.45,0.60,1.04]]),
  ];
  const vinylRoof = loft([[-2.04,0.57,1.62,1.69],[-1.85,0.67,1.675,1.78],[-1.35,0.74,1.70,1.81],[-0.26,0.70,1.70,1.80],[0.04,0.63,1.66,1.75],[0.13,0.59,1.665,1.71]]);
  const dark = [box(0,0.45,-0.05,1.19,0.12,4.21), box(0,0.82,2.076,0.83,0.51,0.05)];
  const trim = [];
  const glass = [];
  const panelWood = new THREE.MeshPhysicalMaterial({
    color:0x4e2b20, roughness:.39, metalness:.04, clearcoat:.70,
    clearcoatRoughness:.27, envMap:environment, envMapIntensity:.42,
  });
  const felt = new THREE.MeshStandardMaterial({color:0x40372b,roughness:.97});
  const dialFace = new THREE.MeshStandardMaterial({color:0x242827,roughness:.48});
  const dialInk = new THREE.MeshStandardMaterial({
    color:0xd5bd82,roughness:.64,emissive:0x88714b,emissiveIntensity:.045,
  });
  const {broadcloth,welt} = upholsteredBenches();
  const instruments = [], bezels = [], markings = [];
  for (const [gx,radius] of [[.17,.029],[.35,.053],[.53,.029]]) {
    const y = 1.097, z = .265;
    instruments.push(new THREE.CylinderGeometry(radius,radius,.011,22).rotateX(Math.PI/2).translate(gx,y,z));
    bezels.push(new THREE.TorusGeometry(radius,.005,7,28).translate(gx,y,z-.008));
    for (let tick=0;tick<=8;tick++) {
      const angle = Math.PI*.16 + Math.PI*1.68*tick/8;
      markings.push(bar([gx+Math.cos(angle)*radius*.69,y+Math.sin(angle)*radius*.69,z-.010],
        [gx+Math.cos(angle)*radius*.87,y+Math.sin(angle)*radius*.87,z-.010],.0017,5));
    }
    markings.push(bar([gx,y,z-.012],[gx-radius*.57,y+radius*.42,z-.012],.0023,6));
  }
  batch(group,broadcloth,seatFabric());
  batch(group,welt,new THREE.MeshStandardMaterial({color:0x6a5141,roughness:.94}));
  batch(group,[
    box(0,1.068,.325,1.39,.154,.113),
    box(0,1.153,.329,1.27,.029,.117),
  ],panelWood);
  batch(group,[box(0,.575,-.10,1.35,.036,.90),box(0,.583,-1.10,1.31,.049,.48)],felt);
  batch(group,instruments,dialFace);
  batch(group,bezels,metal);
  batch(group,markings,dialInk,false);
  const steeringColumn = new THREE.Group();
  steeringColumn.position.set(0.35,1.23,0.13);
  steeringColumn.rotation.x = -0.38;
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'Steering wheel';
  steeringColumn.add(steeringWheel);
  group.add(steeringColumn);
  const rim = new THREE.TorusGeometry(0.152,0.013,10,36);
  const spokes = [new THREE.CylinderGeometry(.031,.031,.037,12).rotateX(Math.PI/2)];
  for (const angle of [Math.PI/6, Math.PI*5/6, -Math.PI/2]) {
    spokes.push(bar([0,0,.011],[Math.cos(angle)*.144,Math.sin(angle)*.144,0],.010));
  }
  batch(steeringWheel,[rim],roofMaterial);
  batch(steeringWheel,spokes,metal);
  trim.push(bar([0.35,1.23,0.145], [0.35,1.04,0.46], 0.017));
  const frontDoors = [];

  for (const side of [-1, 1]) {
    const x = side;
    dark.push(fender(x * 0.90, 1.46), fender(x * 0.90, -1.57));
    dark.push(box(x * 0.93, 0.425, -0.08, 0.35, 0.07, 2.33));
    pane(glass,body,[[x*.835,1.09,-.695],[x*.77,1.09,-1.90],
      [x*.64,1.67,-1.80],[x*.71,1.68,-.660]]);
    trim.push(bar([x*.841,1.057,-.689],[x*.81,1.057,-1.92],.011));
    trim.push(bar([x*.81,.975,-1.53],[x*.81,.975,-1.38],.014));

    const door = new THREE.Group();
    door.name = side > 0 ? 'Driver door' : 'Passenger door';
    door.position.set(x*.752,1.077,.345);
    group.add(door);
    frontDoors.push(door);
    const skin = [], frame = [], glazing = [], fittings = [];
    const outer = [[x*.773,.584,.342],[x*.831,.574,-.654],
      [x*.841,1.08,-.654],[x*.755,1.088,.342]];
    const inside = outer.map(([px,py,pz])=>[px-x*.055,py,pz]);
    skin.push(panel(side > 0 ? outer : [...outer].reverse()),
      panel(side > 0 ? [...inside].reverse() : inside));
    for (let i = 0; i < outer.length; i++) {
      const j = (i+1)%outer.length;
      const edge = [outer[i],inside[i],inside[j],outer[j]];
      skin.push(panel(side > 0 ? edge : edge.reverse()));
    }
    pane(glazing,frame,[[x*.751,1.10,.339],[x*.833,1.09,-.652],
      [x*.71,1.68,-.621],[x*.615,1.66,.075]]);
    fittings.push(bar([x*.841,1.061,-.656],[x*.755,1.061,.342],.011),
      bar([x*.85,.976,-.553],[x*.85,.976,-.389],.013),
      bar([x*.78,.978,-.517],[x*.78,.978,-.402],.015),
      bar([x*.769,.834,-.433],[x*.769,.821,-.161],.018));
    const doorPosition = door.position;
    const relative = pieces => pieces.map(piece=>piece.translate(-doorPosition.x,-doorPosition.y,-doorPosition.z));
    batch(door,relative(skin.concat(frame)),paint);
    batch(door,relative(fittings),metal);
    batch(door,relative(glazing),glassMaterial,false);
    for (let slot = 0; slot < 9; slot++) {
      const z = 0.67 + slot * 0.092;
      const hoodWidth = 0.63 - Math.max(0, z - 0.36) * 0.092;
      dark.push(bar([x * hoodWidth,.784,z],[x * hoodWidth,.968,z + .035],.009,5));
    }
    trim.push(bar([x*.25,.635,1.95], [x*.63,.76,2.11], .025));
  }
  pane(glass, body, [[-.75,1.106,.35],[.75,1.106,.35],[.615,1.664,.075],[-.615,1.664,.075]]);
  pane(glass, body, [[.77,1.10,-1.90],[-.77,1.10,-1.90],[-.64,1.67,-1.80],[.64,1.67,-1.80]]);
  trim.push(bar([0,1.105,.354],[0,1.664,.081],.019));
  const radiator = [[-.455,.59,2.112],[.455,.59,2.112],[.44,1.04,2.112],[.33,1.109,2.112],[-.33,1.109,2.112],[-.44,1.04,2.112]];
  for (let i = 0; i < radiator.length; i++) trim.push(bar(radiator[i], radiator[(i + 1) % radiator.length],.027));
  for (let i = -9; i <= 9; i++) trim.push(box(i * .041, .818, 2.123, .012, .436, .017));
  for (const end of [-1, 1]) {
    trim.push(bar([-.98,.485,end*2.24], [.98,.485,end*2.24], .024));
    trim.push(bar([-.89,.565,end*2.25], [.89,.565,end*2.25], .024));
  }

  const front = [];
  const rear = [];
  const spotLights = [];
  for (const side of [-1, 1]) {
    const x = side * 0.66;
    const shell = new THREE.SphereGeometry(.154,18,10).scale(1,1,.58).translate(x,.774,2.036);
    trim.push(shell);
    const ring = new THREE.TorusGeometry(.139,.016,8,28);
    trim.push(ring.translate(x,.774,2.121));
    front.push(new THREE.SphereGeometry(.132,18,10).scale(1,1,.24).translate(x,.774,2.124));
    rear.push(new THREE.SphereGeometry(.064,14,8).scale(1,1,.45).translate(x,.684,-2.24));
    if (powered) {
      const light = new THREE.SpotLight(0xffddb0, 0, 38, Math.PI / 7.5, 0.49, 1.7);
      light.position.set(x,.774,2.19);
      const aim = new THREE.Object3D();
      aim.position.set(x,.12,14);
      light.target = aim;
      group.add(light, aim);
      spotLights.push(light);
    }
  }
  batch(group, body, paint);
  batch(group, [vinylRoof], roofMaterial);
  batch(group, dark, enamel);
  batch(group, trim, metal);
  batch(group, glass, glassMaterial, false);
  batch(group, front, headlightMat, false);
  batch(group, rear, stopLightMat, false);
  const wheels = [];
  for (const side of [-1,1]) {
    for (const z of [1.46,-1.57]) {
      const wheel = buildWheel(side, z, {rubber, metal, whitewall:whitewallMaterial}, whitewall);
      wheels.push(wheel);
      group.add(wheel.holder);
    }
  }
  return {group, wheels, driverDoor:frontDoors[1], steeringWheel, headlightMat, stopLightMat, spotLights, reflective:[paint,enamel,metal,glassMaterial]};
}

export function updateSedanWheels(car, travelled, steering, dt) {
  car.wheelAngle = (car.wheelAngle + travelled / TYRE_RADIUS) % (Math.PI * 2);
  car.steeringAngle = THREE.MathUtils.damp(car.steeringAngle, steering * 0.42, 13, dt);
  car.steeringWheel.rotation.z = -car.steeringAngle * 1.65;
  for (const wheel of car.wheels) {
    wheel.roll.rotation.x = car.wheelAngle;
    if (wheel.front) wheel.holder.rotation.y = car.steeringAngle;
  }
}
