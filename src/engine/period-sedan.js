import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from './deco-shared.js';
import { createSedanRide, FRONT_AXLE_Z, REAR_AXLE_Z, HALF_TRACK, TYRE_RADIUS, frontWheelAngle } from './vehicle-motion.mjs';

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

function buildWheel(side, z, materials, whitewall) {
  const holder = new THREE.Group();
  const x = side * HALF_TRACK;
  holder.name = (z > 0 ? 'Front' : 'Rear') + (side < 0 ? ' left wheel' : ' right wheel');
  holder.position.set(x, TYRE_RADIUS, z);
  const roll = new THREE.Group();
  holder.add(roll);
  const tyreSection = [
    [0.268, -0.103], [0.322, -0.115], [0.363, -0.098], [0.382, -0.067],
    [TYRE_RADIUS, -0.046], [TYRE_RADIUS, -0.032], [0.381, -0.029], [0.381, -0.024],
    [TYRE_RADIUS, -0.021], [TYRE_RADIUS, 0.021], [0.381, 0.024], [0.381, 0.029],
    [TYRE_RADIUS, 0.032], [TYRE_RADIUS, 0.046], [0.382, 0.067], [0.363, 0.098],
    [0.322, 0.115], [0.268, 0.103], [0.268, -0.103],
  ];
  const tyre = new THREE.LatheGeometry(tyreSection.map(([r, y]) => new THREE.Vector2(r, y)), 40);
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
  return { holder, roll, x, z };
}


function buildAxle(z, material) {
  const axle = new THREE.Group();
  const rear = z < 0;
  axle.name = rear ? 'Rear axle and differential' : 'Front beam axle';
  axle.position.set(0, TYRE_RADIUS, z);
  const ends = HALF_TRACK - 0.024;
  const parts = rear ? [
    bar([-ends, 0, 0], [ends, 0, 0], 0.032),
    new THREE.SphereGeometry(0.117, 16, 10).scale(1.15, 1, 1.12),
    bar([0, 0, 0], [0, 0.025, 0.22], 0.051),
  ] : [
    bar([-ends, 0, 0], [-0.62, -0.044, 0], 0.024),
    box(0, -0.044, 0, 1.24, 0.046, 0.06),
    bar([0.62, -0.044, 0], [ends, 0, 0], 0.024),
    bar([-0.76, 0.005, -0.12], [0.76, 0.005, -0.12], 0.012),
  ];

  // The semi-elliptic packs sit under the frame rails on the beam.
  const length = rear ? 1.08 : 0.87;
  for (const x of [-0.53, 0.53]) {
    for (let leaf = 0; leaf < 4; leaf++) {
      const reach = length * (0.5 - 0.075 * leaf);
      for (const side of [-1, 1]) {
        parts.push(
          bar([x, -leaf * 0.012, 0], [x, 0.033 - leaf * 0.012, side * reach * 0.57], 0.014, 6),
          bar([x, 0.033 - leaf * 0.012, side * reach * 0.57], [x, 0.087 - leaf * 0.012, side * reach], 0.014, 6),
        );
      }
    }
    parts.push(box(x, 0.01, 0, 0.065, 0.09, 0.106));
  }
  batch(axle, parts, material);
  return axle;
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
  const chassis = new THREE.Group();
  chassis.name = 'Sprung chassis';
  group.add(chassis);
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
  batch(chassis,broadcloth,seatFabric());
  batch(chassis,welt,new THREE.MeshStandardMaterial({color:0x6a5141,roughness:.94}));
  batch(chassis,[
    box(0,1.068,.325,1.39,.154,.113),
    box(0,1.153,.329,1.27,.029,.117),
  ],panelWood);
  batch(chassis,[box(0,.575,-.10,1.35,.036,.90),box(0,.583,-1.10,1.31,.049,.48)],felt);
  batch(chassis,instruments,dialFace);
  batch(chassis,bezels,metal);
  batch(chassis,markings,dialInk,false);
  const steeringColumn = new THREE.Group();
  steeringColumn.position.set(0.35,1.23,0.13);
  steeringColumn.rotation.x = -0.38;
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'Steering wheel';
  steeringColumn.add(steeringWheel);
  chassis.add(steeringColumn);
  const rim = new THREE.TorusGeometry(0.152,0.013,10,36);
  const spokes = [new THREE.CylinderGeometry(.031,.031,.037,12).rotateX(Math.PI/2)];
  for (const angle of [Math.PI/6, Math.PI*5/6, -Math.PI/2]) {
    spokes.push(bar([0,0,.011],[Math.cos(angle)*.144,Math.sin(angle)*.144,0],.010));
  }
  batch(steeringWheel,[rim],roofMaterial);
  batch(steeringWheel,spokes,metal);
  trim.push(bar([0.35,1.23,0.145], [0.35,1.04,0.46], 0.017));
  const accessDoors = {};

  for (const side of [-1, 1]) {
    const x = side;
    dark.push(fender(x * 0.90, FRONT_AXLE_Z), fender(x * 0.90, REAR_AXLE_Z));
    dark.push(box(x * 0.93, 0.425, -0.08, 0.35, 0.07, 2.33));
    const step = new THREE.Object3D();
    step.name = (side > 0 ? 'Driver' : 'Passenger') + ' running board';
    step.position.set(x * 0.99, 0.464, 0.02);
    chassis.add(step);
    for (let rib = 0; rib < 7; rib++) {
      dark.push(box(x * (0.80 + rib * 0.036), 0.461, -0.075, 0.012, 0.007, 2.21));
    }
    trim.push(bar([x * 1.103, .442, -1.23], [x * 1.103, .442, 1.07], .009, 8));
    pane(glass,body,[[x*.835,1.09,-.695],[x*.77,1.09,-1.90],
      [x*.64,1.67,-1.80],[x*.71,1.68,-.660]]);
    trim.push(bar([x*.841,1.057,-.689],[x*.81,1.057,-1.92],.011));
    trim.push(bar([x*.81,.975,-1.53],[x*.81,.975,-1.38],.014));

    const door = new THREE.Group();
    door.name = side > 0 ? 'Driver door' : 'Passenger door';
    door.position.set(x*.752,1.077,.345);
    chassis.add(door);
    function doorAnchor(label, anchorX, y, z) {
      const anchor = new THREE.Object3D();
      anchor.name = (side > 0 ? 'Driver ' : 'Passenger ') + label;
      anchor.position.set(x * anchorX - door.position.x, y - door.position.y, z - door.position.z);
      door.add(anchor);
      return anchor;
    }
    const outside = doorAnchor('outside handle', 0.85, 0.976, -0.471);
    const innerPull = doorAnchor('inside pull', 0.748, 1.038, -0.142);
    const edge = doorAnchor('door edge', 0.831, 0.79, -0.654);
    accessDoors[side] = { door, outside, inside: innerPull, edge, step };
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
      bar([x*.85,.976,-.553],[x*.85,.976,-.389],.013, 10),
      bar([x*.81,.976,-.545],[x*.85,.976,-.545],.018, 9),
      bar([x*.80,.976,-.400],[x*.85,.976,-.400],.018, 9),
      bar([x*.759,.978,-.517],[x*.759,.978,-.402],.015, 9),
      bar([x*.799,.978,-.506],[x*.759,.978,-.506],.012, 8),
      bar([x*.790,.978,-.413],[x*.759,.978,-.413],.012, 8),
      bar([x*.795,1.038,-.226],[x*.748,1.038,-.200],.012, 8),
      bar([x*.748,1.038,-.200],[x*.748,1.038,-.084],.014, 10),
      bar([x*.748,1.038,-.084],[x*.788,1.038,-.061],.012, 8),
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
      chassis.add(light, aim);
      spotLights.push(light);
    }
  }
  batch(chassis, body, paint);
  batch(chassis, [vinylRoof], roofMaterial);
  batch(chassis, dark, enamel);
  batch(chassis, trim, metal);
  batch(chassis, glass, glassMaterial, false);
  batch(chassis, front, headlightMat, false);
  batch(chassis, rear, stopLightMat, false);
  const axleMaterial = new THREE.MeshStandardMaterial({color:0x474540, metalness:0.52, roughness:0.69});
  const axles = [buildAxle(FRONT_AXLE_Z, axleMaterial), buildAxle(REAR_AXLE_Z, axleMaterial)];
  group.add(...axles);
  const wheels = [];
  for (const side of [-1,1]) {
    for (const z of [FRONT_AXLE_Z, REAR_AXLE_Z]) {
      const wheel = buildWheel(side, z, {rubber, metal, whitewall:whitewallMaterial}, whitewall);
      wheels.push(wheel);
      group.add(wheel.holder);
    }
  }
  return {
    group, chassis, axles, wheels, ride: createSedanRide(), steeringAngle: 0,
    driverDoor: accessDoors[1].door, accessDoors, steeringWheel, headlightMat, stopLightMat, spotLights,
    reflective: [paint, enamel, metal, glassMaterial],
  };
}

export function updateSedanWheels(car, distance, sideDistance = 0, yawTravel = 0) {
  car.steeringWheel.rotation.z = THREE.MathUtils.clamp(-car.steeringAngle * 1.45, -0.693, 0.693);
  for (const wheel of car.wheels) {
    const steer = wheel.z > 0 ? frontWheelAngle(car.steeringAngle, wheel.x) : 0;
    wheel.holder.rotation.y = steer;
    const forward = distance - wheel.x * yawTravel;
    const lateral = sideDistance + wheel.z * yawTravel;
    const travel = forward * Math.cos(steer) + lateral * Math.sin(steer);
    wheel.roll.rotation.x = (wheel.roll.rotation.x + travel / TYRE_RADIUS) % (Math.PI * 2);
  }
}

const rollCenter = new THREE.Vector3();
const ROLL_CENTER_HEIGHT = 0.49;

export function applySedanRide(car) {
  const { chassis, axles, wheels, ride } = car;
  chassis.rotation.set(ride.pitch.value, 0, ride.roll.value, 'ZXY');
  rollCenter.set(0, ROLL_CENTER_HEIGHT, 0).applyEuler(chassis.rotation);
  chassis.position.set(-rollCenter.x, ROLL_CENTER_HEIGHT + ride.heave.value - rollCenter.y, -rollCenter.z);
  for (let i = 0; i < wheels.length; i++) wheels[i].holder.position.y = TYRE_RADIUS + ride.support[i];

  for (let i = 0; i < axles.length; i++) {
    const left = wheels[i].holder.position.y;
    const right = wheels[i + 2].holder.position.y;
    axles[i].position.y = (left + right) * 0.5;
    axles[i].rotation.z = Math.atan2(right - left, HALF_TRACK * 2);
  }
}
