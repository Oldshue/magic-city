import * as THREE from '../../vendor/three.module.min.js';
import { FORD_TUDOR } from './vehicle-motion.mjs';
import { buildWindshield } from './windshield.js';
import { bar, batch, box, headlightBeam, loft, pane, panel, seatFabric, surface } from './vehicle-geometry.js';

const {frontAxleZ, rearAxleZ, halfTrack, seatOffset} = FORD_TUDOR;
const DASH = .221;
const ROOF = 1.794;

function fender(x, stations) {
  const offsets = [-1,-.89,-.56,0,.56,.89,1];
  const positions = [], indices = [];
  for (const [z,y,width] of stations) {
    for (const side of offsets) positions.push(x+width*side,y+.043*(1-side**4),z);
  }
  const count = offsets.length;
  for (let i=0;i<stations.length-1;i++) {
    for (let j=0;j<count-1;j++) {
      const a = i*count+j;
      indices.push(a,a+count,a+1,a+1,a+count,a+count+1);
    }
  }
  return surface(positions,indices);
}

function buildTudorDoor(chassis, side, materials) {
  const {paint, glassMaterial, metal, roofMaterial} = materials;
  const pivot = new THREE.Group();
  const driver = side > 0 ? 'Driver' : 'Passenger';
  pivot.name = driver + ' door';
  pivot.position.set(side*.583,1.12,.229);
  chassis.add(pivot);
  const addAnchor = (label,x,y,z) => {
    const node = new THREE.Object3D();
    node.name = driver + ' ' + label;
    node.position.set(x*side-pivot.position.x,y-pivot.position.y,z-pivot.position.z);
    pivot.add(node);
    return node;
  };

  const outer = [[side*.605,.546,.224],[side*.648,.549,-.625],[side*.662,1.126,-.623],[side*.588,1.134,.226]];
  const inner = outer.map(([x,y,z])=>[x-side*.048,y,z]);
  const front = side>0 ? outer : [...outer].reverse();
  const back = side>0 ? [...inner].reverse() : inner;
  const skin = [panel(front),panel(back)];
  for (let i=0;i<4;i++) {
    const j = (i+1)%4;
    const sideWall = [outer[i],inner[i],inner[j],outer[j]];
    skin.push(panel(side>0 ? sideWall : [...sideWall].reverse()));
  }

  const glazing = [], trim = [];
  pane(glazing,trim,[[side*.589,1.154,.21],[side*.651,1.146,-.609],
    [side*.594,1.708,-.601],[side*.527,1.698,.145]],.022);
  const fittings = [
    bar([side*.593,1.126,.223],[side*.661,1.12,-.620],.013),
    bar([side*.680,1.045,-.543],[side*.680,1.008,-.417],.012,9),
    bar([side*.650,1.043,-.544],[side*.680,1.045,-.543],.016,9),
    bar([side*.642,1.025,-.252],[side*.596,1.016,-.179],.012,9),
    bar([side*.596,1.016,-.179],[side*.593,1.005,-.082],.010,8),
  ];
  for (const y of [.714,1.073]) {
    fittings.push(bar([side*.613,y,.202],[side*.613,y+.043,.202],.020,8));
  }
  const local = parts=>parts.map(g=>g.translate(-pivot.position.x,-pivot.position.y,-pivot.position.z));
  batch(pivot,local(skin),paint);
  batch(pivot,local(trim),roofMaterial);
  batch(pivot,local(fittings),metal);
  batch(pivot,local(glazing),glassMaterial,false);

  const step = new THREE.Object3D();
  step.name = driver + ' running board';
  step.position.set(side*.78,.463,.021);
  chassis.add(step);
  return { door:pivot, step,
    outside:addAnchor('outside handle',.682,1.028,-.485),
    inside:addAnchor('inside pull',.595,1.013,-.130),
    edge:addAnchor('door edge',.662,.82,-.625),
  };
}

function tudorDashboard(chassis, materials, powered) {
  const {paint, metal, enamel, roofMaterial} = materials;
  const dialFace = new THREE.MeshStandardMaterial({color:0x161c1c,roughness:.58});
  const dialInk = new THREE.MeshStandardMaterial({
    color:0xe2cc98,emissive:0x8c6338,emissiveIntensity:.05,roughness:.62,
  });
  const dashTop = new THREE.Shape();
  dashTop.moveTo(-.584,1.070);
  dashTop.lineTo(.584,1.070);
  dashTop.quadraticCurveTo(.566,1.173,.521,1.177);
  dashTop.lineTo(-.521,1.177);
  dashTop.quadraticCurveTo(-.566,1.173,-.584,1.070);
  batch(chassis,[new THREE.ExtrudeGeometry(dashTop,{
    depth:.077,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:2,steps:1,
  }).translate(0,0,DASH)],paint);

  const plate = new THREE.Shape();
  plate.moveTo(-.188,1.117);
  plate.quadraticCurveTo(-.126,1.195,0,1.212);
  plate.quadraticCurveTo(.126,1.195,.188,1.117);
  plate.quadraticCurveTo(.126,1.041,0,1.027);
  plate.quadraticCurveTo(-.126,1.041,-.188,1.117);
  const panel = new THREE.Group();
  panel.name = 'Nickel instrument panel';
  panel.position.set(-.150,.032,0);
  chassis.add(panel);
  const gz=DASH-.018, gy=1.143, radius=.047;
  const nickel = [new THREE.ExtrudeGeometry(plate,{
    depth:.013,bevelEnabled:true,bevelThickness:.005,bevelSize:.009,bevelSegments:2,steps:1,
  }).translate(0,0,gz-.004),
  new THREE.TorusGeometry(radius+.003,.003,7,35).translate(0,gy,gz-.010)];
  for (const x of [-.118,.118]) nickel.push(bar([x,1.104,gz-.006],[x,1.104,gz-.028],.018,10));
  batch(panel,nickel,metal);
  batch(panel,[new THREE.CylinderGeometry(radius,radius,.009,36).rotateX(Math.PI/2).translate(0,gy,gz-.009),
    box(0,1.068,gz-.012,.062,.020,.008)],dialFace);
  const ticks = [];
  for (let i=0;i<=8;i++) {
    const a = Math.PI*(.16+i*1.68/8);
    ticks.push(bar([Math.cos(a)*radius*.72,gy+Math.sin(a)*radius*.72,gz-.014],
      [Math.cos(a)*radius*.90,gy+Math.sin(a)*radius*.90,gz-.014],.0015,6));
  }
  const pointer = bar([-.006,0,0],[radius*.75,0,0],.0018,6);
  let speedNeedle = null;
  if (powered) {
    speedNeedle = new THREE.Group();
    speedNeedle.name = 'Speedometer needle';
    speedNeedle.position.set(0,gy,gz-.016);
    speedNeedle.rotation.z = Math.PI*.16;
    batch(speedNeedle,[pointer],dialInk,false);
    panel.add(speedNeedle);
  } else {
    ticks.push(pointer.rotateZ(Math.PI*.54).translate(0,gy,gz-.016));
  }
  batch(panel,ticks,dialInk,false);

  const [offsetX,offsetY,offsetZ] = seatOffset;
  const x = .35+offsetX, y = 1.23+offsetY, z = .13+offsetZ;
  const column = new THREE.Group();
  column.position.set(x,y,z);
  column.rotation.x = -.38;
  chassis.add(column);
  const rimRadius = .152;
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'Steering wheel';
  steeringWheel.userData.rimRadius = rimRadius;
  column.add(steeringWheel);
  const spoke = bar([-.143,0,.009],[.143,0,.009],.008,9);
  batch(steeringWheel,[new THREE.TorusGeometry(rimRadius,.011,10,40),spoke,spoke.clone().rotateZ(Math.PI/2)],enamel);
  batch(steeringWheel,[new THREE.CylinderGeometry(.033,.033,.030,18).rotateX(Math.PI/2).translate(0,0,-.010)],roofMaterial);
  batch(chassis,[
    bar([x,y,z+.019],[x,1.026,.513],.019,12),
    bar([-.102,.607,-.117],[-.12,.952,.108],.010,10),
    new THREE.SphereGeometry(.023,12,8).translate(-.12,.952,.108),
    bar([.031,.627,-.228],[.017,.765,-.042],.009,9),
  ],enamel);
  return { steeringWheel, speedNeedle, dialInk };
}

export function buildFordTudorBody(chassis, materials, powered) {
  const {paint, enamel, metal, roofMaterial, glassMaterial, headlightMat, stopLightMat} = materials;
  const body = [
    loft([[-1.747,.460,.567,1.077],[-1.710,.559,.549,1.117],[-1.582,.613,.523,1.128],
      [-1.355,.659,.500,1.129],[-.624,.665,.526,1.126]]),
    loft([[-.628,.649,.482,.547],[.230,.608,.489,.550]]),
    loft([[.228,.604,.489,1.132],[.402,.554,.522,1.137],[.469,.498,.535,1.132]]),
    loft([[.440,.501,.538,1.134],[.602,.474,.536,1.126],[.950,.425,.541,1.113],
      [1.350,.362,.551,1.099],[1.486,.345,.550,1.092]]),
    loft([[-1.681,.468,1.660,1.720],[-1.534,.567,1.698,1.765],[-1.285,.614,1.704,1.779],
      [-.630,.606,1.707,1.780],[.079,.546,1.703,1.773],[.157,.513,1.690,1.752]]),
  ];
  const leatherette = loft([[-1.541,.537,1.733,1.758],[-1.291,.572,1.761,ROOF],
    [-.613,.562,1.766,ROOF],[.079,.515,1.754,1.787],[.139,.493,1.725,1.762]]);
  const black = [box(0,.434,-.027,.997,.105,3.26),box(0,.790,1.501,.569,.426,.042)];
  const bright = [], glazing = [], seal = [], front = [], rear = [];
  const spotLights = [];
  const accessDoors = {};
  for (const side of [-1,1]) {
    const x = side * halfTrack;
    black.push(
      fender(x,[
        [frontAxleZ-.891,.423,.132],[frontAxleZ-.753,.472,.153],[frontAxleZ-.641,.559,.168],
        [frontAxleZ-.518,.675,.178],[frontAxleZ-.404,.785,.181],[frontAxleZ-.252,.835,.179],
        [frontAxleZ-.072,.857,.175],[frontAxleZ+.116,.845,.163],[frontAxleZ+.297,.789,.143],[frontAxleZ+.447,.717,.112],
      ]),
      fender(x,[
        [rearAxleZ-.474,.525,.134],[rearAxleZ-.396,.649,.161],[rearAxleZ-.278,.753,.175],
        [rearAxleZ-.127,.818,.179],[rearAxleZ+.028,.835,.178],[rearAxleZ+.184,.812,.179],
        [rearAxleZ+.345,.755,.169],[rearAxleZ+.455,.674,.159],[rearAxleZ+.524,.482,.141],
      ]),
      box(side*.745,.429,-.177,.274,.060,1.225),
    );
    for (let rib=0;rib<8;rib++) {
      black.push(box(side*(.635+rib*.031),.460,-.177,.008,.006,1.164));
    }
    bright.push(bar([side*.880,.444,-.760],[side*.880,.444,.391],.007,8));
    pane(glazing,seal,[[side*.664,1.146,-.644],[side*.611,1.156,-1.533],
      [side*.555,1.676,-1.491],[side*.590,1.708,-.645]],.025);
    const pillar = [[side*.664,1.126,-.625],[side*.665,1.128,-.672],
      [side*.592,1.708,-.664],[side*.594,1.710,-.619]];
    const quarter = [[side*.612,1.145,-1.528],[side*.547,1.116,-1.738],
      [side*.466,1.677,-1.654],[side*.555,1.676,-1.490]];
    body.push(panel(side>0 ? pillar : [...pillar].reverse()),
      panel(side>0 ? quarter : [...quarter].reverse()));
    seal.push(bar([side*.613,1.147,-1.528],[side*.664,1.144,-.643],.009),
      bar([side*.667,1.120,-.646],[side*.588,1.136,.228],.009));
    for (let louver=0;louver<16;louver++) {
      const z = .55+louver*.041;
      const x = side*(.482-(z-.55)*.139);
      black.push(bar([x,.802,z],[x,.971,z+.005],.0048,6));
    }
    bright.push(bar([side*.458,.841,.677],[side*.455,.913,.677],.010,9));
    accessDoors[side] = buildTudorDoor(chassis,side,materials);

    const lightX=side*.482, lightY=.987, lightZ=1.419;
    bright.push(new THREE.SphereGeometry(.116,20,12).scale(1,1,.68).translate(lightX,lightY,lightZ),
      new THREE.TorusGeometry(.105,.012,9,35).translate(lightX,lightY,lightZ+.073),
      bar([lightX,.875,lightZ],[lightX,.715,lightZ],.026,9));
    front.push(new THREE.SphereGeometry(.101,24,14).scale(1,1,.26).translate(lightX,lightY,lightZ+.066));
    if (powered) spotLights.push(headlightBeam(chassis,lightX,lightY,lightZ+.139));
  }

  const windshieldCorners = [[.583,1.148,.216],[-.583,1.148,.216],
    [-.520,1.695,.130],[.520,1.695,.130]];
  pane(glazing,seal,windshieldCorners,.025);
  const visor = loft([[.135,.514,1.692,1.740],[.206,.518,1.702,1.733],[.289,.489,1.675,1.712]]);
  black.push(visor);
  bright.push(bar([-.494,1.679,.287],[.494,1.679,.287],.0059));
  const windshield = powered ? buildWindshield(chassis,windshieldCorners,{
    pivots:[.314], inner:.235, outer:.475, park:-1.46, far:.51, strokeSeconds:.94,
  },materials) : null;
  if (!powered) {
    seal.push(bar([.314,1.678,.150],[.074,1.648,.155],.004,6),
      bar([.074,1.648,.155],[-.158,1.624,.155],.0055,6));
  }

  const rearBottom = [[-.551,1.098,-1.738],[-.521,1.324,-1.736],[.521,1.324,-1.736],[.551,1.098,-1.738]];
  const rearTop = [[-.493,1.570,-1.687],[-.466,1.677,-1.654],[.466,1.677,-1.654],[.493,1.570,-1.687]];
  body.push(panel(rearBottom),panel(rearTop));
  pane(glazing,seal,[[.493,1.324,-1.734],[-.493,1.324,-1.734],
    [-.460,1.571,-1.686],[.460,1.571,-1.686]],.022);

  const radiator = [[-.323,.552,1.519],[.323,.552,1.519],[.331,1.001,1.519],
    [.284,1.075,1.519],[.170,1.097,1.519],[-.170,1.097,1.519],[-.284,1.075,1.519],[-.331,1.001,1.519]];
  for (let i=0;i<radiator.length;i++) bright.push(bar(radiator[i],radiator[(i+1)%radiator.length],.018,9));
  for (let i=-14;i<=14;i++) bright.push(box(i*.020,.820,1.535,.0038,.458-Math.abs(i)*.002,.005));
  bright.push(bar([-.502,.875,1.429],[.502,.875,1.429],.013,11),
    new THREE.CylinderGeometry(.036,.033,.017,20).translate(0,1.114,1.457));
  for (const z of [1.827,-1.848]) {
    for (const y of [.45,.530]) {
      bright.push(bar([-.687,y,z-.036],[-.584,y,z],.013,9),
        box(0,y,z,1.174,.029,.031),bar([.584,y,z],[.687,y,z-.036],.013,9));
    }
  }
  black.push(box(0,.491,-1.650,.307,.102,.375));
  bright.push(bar([.616,.736,-1.631],[.629,.736,-1.766],.014,9),
    new THREE.TorusGeometry(.054,.008,8,26).translate(.629,.736,-1.776));
  rear.push(new THREE.SphereGeometry(.047,18,11).scale(1,1,.36).translate(.629,.736,-1.777));

  const cloth = [];
  const seams = [];
  for (const [x,z,width] of [[-.289,-.415,.248],[.289,-.415,.248],[0,-1.490,.511]]) {
    cloth.push(loft([[z,width*.93,.703,.880],[z+.064,width,.717,.923],[z+.413,width,.716,.914],[z+.477,width*.94,.734,.870]]).translate(x,0,0),
      loft([[z-.052,width*.9,.784,1.163],[z+.043,width,.79,1.226],[z+.117,width*.96,.78,1.204]]).translate(x,0,0));
    for (const strip of [-2,-1,0,1,2]) {
      const stripeX = x + strip*width*.31;
      seams.push(bar([stripeX,.925,z+.128],[stripeX,.916,z+.401],.0028,6));
    }
    seams.push(bar([x-width*.83,.887,z+.467],[x+width*.83,.887,z+.467],.006,7));
  }
  for (const g of cloth) {
    const {position,uv} = g.attributes;
    for (let i=0;i<position.count;i++) uv.setXY(i,position.getX(i)*7,(position.getY(i)+position.getZ(i))*7);
  }

  batch(chassis,body,paint);
  batch(chassis,black,enamel);
  batch(chassis,bright,metal);
  batch(chassis,[leatherette,...seal],roofMaterial);
  batch(chassis,glazing,glassMaterial,false);
  batch(chassis,front,headlightMat,false);
  batch(chassis,rear,stopLightMat,false);
  batch(chassis,cloth,seatFabric(0x776d60));
  batch(chassis,[box(0,.550,-.567,1.155,.048,1.60),box(0,.563,.117,1.085,.038,.448),...seams],roofMaterial);
  return {...tudorDashboard(chassis,materials,powered),accessDoors,driverDoor:accessDoors[1].door,spotLights,windshield};
}
