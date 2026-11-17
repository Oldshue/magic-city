import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, rand } from '../engine/deco-shared.js';
import { registerNightEmission } from '../engine/materials.js';
import { mapShopUV } from '../engine/shop-surfaces.js';
import { ROAD_HEIGHT, SIDEWALK_HEIGHT } from '../engine/street-layout.js';
import { HEAVIEST_CORNER_CROSSWALK } from '../engine/traffic-motion.mjs';
import { getAudio, makeNoiseBuffer } from '../systems/audioBus.js';

const EDITION = 'The Birmingham Ledger — Extra Edition, October 1928';
const HEADLINE = 'EXTRA! BARONS TAKE THE SOUTHERN PENNANT — CROWDS PACK RICKWOOD FIELD! LEDGER, TWO CENTS!';
const DISPLAY_Y = 1.125;
const SERVICE_TIME = 59/30;
const PICKUP = 12/59;
const RELEASE = 42/59;

function printEdition() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 960;
  const p = canvas.getContext('2d');
  const grain = rand(192810);
  p.fillStyle = '#ede1c2';
  p.fillRect(0,0,768,960);
  for (let i=0;i<9000;i++) {
    p.fillStyle = i%3 ? '#a4895420' : '#fff9e950';
    p.fillRect(grain()*768,grain()*960,1+grain()*2,1);
  }
  const tone = p.createLinearGradient(360,0,406,0);
  tone.addColorStop(0,'#4e382d00');
  tone.addColorStop(.45,'#735c3b23');
  tone.addColorStop(.51,'#fff9e78b');
  tone.addColorStop(1,'#fdf6e500');
  p.fillStyle = tone;
  p.fillRect(354,0,64,960);
  p.fillStyle = '#28221b';
  p.textAlign = 'center';
  p.font = 'bold 69px Georgia';
  p.fillText('The Birmingham Ledger',384,105,686);
  p.fillRect(38,124,692,3);
  p.fillRect(38,166,692,2);
  p.font = 'bold 18px Georgia';
  p.fillText('EXTRA EDITION    •    OCTOBER 1928    •    TWO CENTS',384,150);
  p.font = '900 88px Georgia';
  p.fillText('BARONS TAKE',384,272,697);
  p.fillText('THE PENNANT',384,355,697);
  p.font = 'bold 25px Georgia';
  p.fillText('CROWDS PACK RICKWOOD FIELD',384,408,701);
  p.fillRect(37,432,694,3);

  // Hand-set columns and a halftone illustration of the ballpark.
  for (const x of [37,204,545]) {
    for (let row=0;row<30;row++) {
      p.fillStyle = row%8===0 ? '#2a281d' : '#514737';
      p.fillRect(x,459+row*15,116+grain()*43,row%8===0 ? 4 : 2);
    }
  }
  p.fillStyle = '#595548';
  p.fillRect(371,463,153,234);
  for (let y=468;y<692;y+=5) {
    for (let x=376;x<520;x+=5) {
      const sky = y<548;
      p.fillStyle = sky ? '#e9dcc0' : y<611 ? '#2d3126' : '#b9a887';
      p.fillRect(x,y,sky ? 3 : grain()*4,sky ? 3 : 4);
    }
  }
  p.fillStyle = '#e7dbc0';
  p.beginPath();
  p.moveTo(390,666); p.lineTo(446,575); p.lineTo(509,666); p.lineTo(446,681); p.closePath(); p.fill();
  p.fillStyle = '#4c4638';
  p.font = 'italic 17px Georgia';
  p.fillText('Rickwood Field',448,720,161);
  for (let row=0;row<12;row++) p.fillRect(372,748+row*13,116+grain()*36,2);
  const image = new THREE.CanvasTexture(canvas);
  image.colorSpace = THREE.SRGBColorSpace;
  image.anisotropy = 6;
  return new THREE.MeshStandardMaterial({map:image, roughness:.91, side:THREE.DoubleSide});
}

function paperGeometry(width,height,left=0,right=1) {
  const g = new THREE.PlaneGeometry(width,height,6,7);
  const {position,uv} = g.attributes;
  for (let i=0;i<position.count;i++) {
    const x=position.getX(i),y=position.getY(i);
    position.setZ(i,.003*Math.cos(y*18+x*21)+.007*(x/(width/2))**4);
    uv.setX(i,left+(right-left)*uv.getX(i));
  }
  g.computeVertexNormals();
  return g;
}

function makeCustomers(ctx,x,z) {
  const across = -HEAVIEST_CORNER_CROSSWALK.offset;
  return [-.60,.60].map((offset,i)=>{
    const stripe = across+offset;
    const counter = [x,z+(i ? -.74 : .60)];
    const steps = [
      {to:counter, wait:5.1+i*2.9, read:true},
      {to:[12.9,stripe], approach:true},
      {to:[-12.9,stripe], crossing:true},
      {to:[-14.5,-22.8+offset], wait:3+i*2.3},
      {to:[-12.9,stripe], approach:true},
      {to:[12.9,stripe], crossing:true},
    ];
    const start = i ? 3 : 0;
    const initial = i ? [-14.4,-21.2] : [14.1,z+1.8];
    const actor = {
      id:'ledger-customer-'+(i+1), model:i ? 'shopkeeper' : 'street-worker',
      position:initial, groundY:SIDEWALK_HEIGHT, scale:i ? .95 : 1.02, yawDeg:i ? 210 : 90,
      speed:i ? 1.32 : 1.45, moving:true,
    };
    const pedestrian = {x:initial[0], z:initial[1], y:1.7, crosswalk:'north', active:false};
    ctx.characters.push(actor);
    ctx.crossingVisitors.push(pedestrian);
    return {actor,steps,pedestrian,index:start,time:0};
  });
}

function advanceCustomer(customer,traffic,dt) {
  const {actor,steps,pedestrian} = customer;
  const step=steps[customer.index];
  const [oldX,oldZ]=actor.position;
  if (customer.time>0) {
    customer.time=Math.max(0,customer.time-dt);
    actor.moving=false;
    return;
  }
  if (step.crossing && !customer.crossing) {
    actor.moving=false;
    if (traffic && !traffic.canCross(pedestrian.crosswalk)) return;
    customer.crossing=true;
  }
  const dx=step.to[0]-oldX, dz=step.to[1]-oldZ;
  const distance=Math.hypot(dx,dz);
  const travel=actor.speed*dt;
  if (distance<=travel) {
    actor.position[0]=step.to[0];
    actor.position[1]=step.to[1];
    customer.time=step.wait || 0;
    if (step.read) actor.yawDeg=90;
    if (step.approach) pedestrian.active=true;
    if (step.crossing) {
      pedestrian.active=false;
      customer.crossing=false;
    }
    actor.groundY=SIDEWALK_HEIGHT;
    customer.index=(customer.index+1)%steps.length;
    actor.moving=false;
  } else {
    actor.position[0]+=dx/distance*travel;
    actor.position[1]+=dz/distance*travel;
    const desired=Math.atan2(dx,dz)*180/Math.PI;
    const delta=THREE.MathUtils.euclideanModulo(desired-actor.yawDeg+180,360)-180;
    actor.yawDeg+=delta*(1-Math.exp(-dt*9));
    actor.groundY=step.crossing && Math.abs(actor.position[0])<11 ? ROAD_HEIGHT : SIDEWALK_HEIGHT;
    actor.moving=true;
  }
  [pedestrian.x,pedestrian.z]=actor.position;
}

export function addCornerNewsstand(ctx, district, surfaces) {
  const group=new THREE.Group();
  group.name='Birmingham Ledger kiosk';
  group.position.set(17.65,SIDEWALK_HEIGHT,-21.60);
  group.rotation.y=-Math.PI/2;
  district.add(group);

  const steel=new THREE.MeshStandardMaterial({color:0x273936,roughness:.68,metalness:.21});
  const paint=new THREE.MeshStandardMaterial({color:0x35564a,roughness:.64,metalness:.09});
  const zinc=new THREE.MeshPhysicalMaterial({color:0x605c4f,roughness:.63,metalness:.58,
    envMap:ctx.environment,envMapIntensity:.44,clearcoat:.13});
  const brass=new THREE.MeshStandardMaterial({color:0xad8e58,roughness:.4,metalness:.61,
    envMap:ctx.environment,envMapIntensity:.43});
  const canvas=new THREE.MeshStandardMaterial({color:0x743c2b,roughness:.99,side:THREE.DoubleSide});
  const stripe=new THREE.MeshStandardMaterial({color:0xd3b882,roughness:.93,side:THREE.DoubleSide});
  const opal=registerNightEmission(new THREE.MeshStandardMaterial({
    color:0xffebc9, emissive:0xffd598, roughness:.59,
  }),.45,1.85);
  const newsprint=printEdition();
  ctx.streetReflection?.reflect(zinc);
  const {walnut,marble}=surfaces;
  const batches=new Map();
  const put=(material,geometry)=>{
    if (material.userData.metresPerTile) mapShopUV(geometry,material.userData.metresPerTile);
    if (!batches.has(material)) batches.set(material,[]);
    batches.get(material).push(geometry);
  };
  const box=(material,x,y,z,w,h,d)=>put(material,new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  const paper=(x,y,z,w,h,tilt)=>put(newsprint,paperGeometry(w,h).rotateX(tilt).translate(x,y,z));

  box(marble,0,.063,-.20,3.08,.125,1.75);
  box(steel,0,.162,-.22,2.92,.15,1.66);
  box(walnut,0,.240,-.24,2.82,.08,1.58);
  // Siding, corner posts, shutter rails and a clear service opening.
  box(woodTint(walnut,0x9d8e73),0,1.37,-1.002,2.83,2.28,.105);
  for (const x of [-1.423,1.423]) {
    box(paint,x,.71,-.28,.116,.97,1.56);
    box(steel,x,1.45,-.98,.134,2.44,.148);
    box(steel,x,1.46,.53,.143,2.42,.139);
    for (let slat=0;slat<13;slat++) box(paint,x,1.08+slat*.103,-.29,.104,.081,1.40);
  }
  box(paint,0,.676,.51,2.79,.88,.149);
  box(steel,0,.316,.616,2.76,.13,.061);
  for (const x of [-.92,0,.92]) {
    box(steel,x,.683,.595,.80,.59,.055);
    box(paint,x,.683,.631,.68,.47,.029);
    box(brass,x,.919,.645,.684,.018,.031);
  }
  box(walnut,0,1.047,.155,2.97,.147,1.06);
  box(brass,0,1.101,.688,2.967,.029,.031);
  box(steel,0,2.45,.55,2.99,.29,.16);
  box(walnut,0,1.09,-.905,2.57,.09,.22);
  box(walnut,0,1.77,-.90,2.56,.089,.27);
  box(walnut,0,2.10,-.91,2.63,.061,.23);

  for (const side of [-1,1]) {
    const roof=new THREE.BoxGeometry(1.74,.125,2.07).rotateZ(-side*.145)
      .translate(side*.82,2.765,-.221);
    put(zinc,roof);
    box(brass,side*1.67,2.635,-.21,.045,.091,2.20);
    for (let seam=0;seam<5;seam++) {
      const trim=new THREE.BoxGeometry(1.67,.022,.035).rotateZ(-side*.145);
      put(zinc,trim.translate(side*.82,2.844,-1.17+seam*.435));
    }
  }
  box(zinc,0,2.964,-.218,.086,.072,2.15);
  for (let band=0;band<9;band++) {
    const x=(band-4)*.344;
    const cloth=new THREE.PlaneGeometry(.345,.85,5,3).rotateX(-1.39).translate(x,2.46,.93);
    const positions=cloth.attributes.position;
    for (let i=0;i<positions.count;i++) positions.setY(i,positions.getY(i)-.036*Math.sin(Math.PI*(positions.getX(i)-x+.173)/.345));
    cloth.computeVertexNormals();
    put(band%2 ? stripe : canvas,cloth);
    const flap=new THREE.PlaneGeometry(.345,.153,8,1).translate(x,2.30,1.35);
    put(band%2 ? stripe : canvas,flap);
  }
  box(brass,0,2.383,1.358,3.09,.020,.023);
  box(brass,0,2.32,-.20,.035,.25,.035);
  put(opal,new THREE.SphereGeometry(.123,16,10).scale(1,.61,1).translate(0,2.156,-.20));

  // Clips, bundles, and an angled front-page rack.
  for (const [i,x] of [-1.16,.72,1.12].entries()) {
    const z=-.073+i*.056;
    const height=.035+(i%3)*.018;
    box(stripe,x,DISPLAY_Y+height/2,z,.37,height,.29);
    paper(x,DISPLAY_Y+height+.003,z,.373,.291,-Math.PI/2);
    box(brass,x,DISPLAY_Y+height+.008,z,.014,.014,.297);
  }
  for (const x of [-1.006,1.028]) {
    box(steel,x,.93,.708,.475,.108,.33);
    put(walnut,new THREE.BoxGeometry(.472,.75,.037).rotateX(-.34).translate(x,1.240,.659));
    paper(x,1.255,.693,.417,.589,-.34);
    box(brass,x,1.551,.588,.097,.055,.021);
  }
  box(walnut,1.13,1.22,.355,.405,.188,.29);
  for (const material of batches.keys()) {
    const geometries=batches.get(material);
    const mesh=new THREE.Mesh(mergeGeometries(geometries),material);
    group.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }

  const sign=ctx.deco.canvasSign('THE BIRMINGHAM LEDGER',{
    width:2.87,canvasWidth:1220,canvasHeight:145,colors:['#254035','#b39660','#f2dfb0'],
  });
  sign.position.set(0,2.65,.638);
  group.add(sign);
  const price=ctx.deco.canvasSign('EXTRA  ·  2¢',{
    width:.58,canvasWidth:412,canvasHeight:172,colors:['#753e2b','#c9a16b','#fff0cb'],
  });
  price.position.set(.012,1.241,.71);
  group.add(price);

  const vendorAt=group.localToWorld(new THREE.Vector3(.025,0,-.447));
  const actor={id:'ledger-vendor',model:'ledger-vendor',position:[vendorAt.x,vendorAt.z],
    groundY:SIDEWALK_HEIGHT,scale:.97,yawDeg:-90,lookAtVisitor:true};
  ctx.characters.push(actor);

  const sheet=new THREE.Group();
  sheet.name='Ledger serving copy';
  sheet.userData.restHeight=DISPLAY_Y;
  sheet.userData.gripOffset=.021;
  sheet.rotation.x=-Math.PI/2;
  const left=new THREE.Mesh(paperGeometry(.232,.63,0,.5),newsprint);
  left.position.x=-.116;
  const hinge=new THREE.Group();
  const right=new THREE.Mesh(paperGeometry(.232,.63,.5,1),newsprint);
  right.position.x=.116;
  hinge.add(right);
  sheet.add(left,hinge);
  group.add(sheet);
  const stock=new THREE.Vector3(-.30,DISPLAY_Y+.003,-.020);
  const served=new THREE.Vector3(-.21,DISPLAY_Y+.006,.369);
  sheet.position.copy(stock);
  hinge.rotation.y=-2.89;
  const visitor=new THREE.Vector3();
  const marker=new THREE.Object3D();
  marker.position.set(-.18,1.41,1.38);
  group.add(marker);
  let timer=-1, audioNoise;
  ctx.registerInteractive(marker,{
    title:EDITION,
    body:'Elias Green unfolds a copy at the counter.\n\n"'+HEADLINE+'"',
    available:position=>{
      group.worldToLocal(visitor.copy(position));
      return visitor.z>1.24 && visitor.z<3.40 && Math.abs(visitor.x)<1.53 && visitor.y<2.55;
    },
    onRead(){
      if (timer>=0 && timer<SERVICE_TIME) return;
      sheet.position.copy(stock);
      hinge.rotation.y=-2.89;
      timer=0;
      actor.performance={clip:'SellEdition',phase:0};
      const audio=getAudio();
      if (!audio) return;
      audioNoise ??= makeNoiseBuffer(audio.ctx,.46,rand(1928002));
      const source=audio.ctx.createBufferSource(), gain=audio.ctx.createGain(), filter=audio.ctx.createBiquadFilter();
      source.buffer=audioNoise;
      filter.type='bandpass'; filter.frequency.value=2270; filter.Q.value=.92;
      const time=audio.ctx.currentTime+.48;
      gain.gain.setValueAtTime(.001,time);
      gain.gain.linearRampToValueAtTime(.134,time+.08);
      gain.gain.exponentialRampToValueAtTime(.001,time+.40);
      source.connect(filter).connect(gain).connect(audio.master);
      source.start(time);
    },
  });

  ctx.controls.addColliders([{
    minX:group.position.x-.69,maxX:group.position.x+1.06,
    minZ:group.position.z-1.53,maxZ:group.position.z+1.53,
  }]);
  const bulb=group.localToWorld(new THREE.Vector3(0,2.10,.27));
  ctx.deco.registerLampPosition(bulb.x,bulb.y,bulb.z,{
    color:0xffdbad,reach:6.5,daytime:21,nighttime:37,
  });
  const customers=makeCustomers(ctx,15.25,group.position.z);
  ctx.newsstands.push({update(dt,traffic){
    for (const customer of customers) advanceCustomer(customer,traffic,dt);
    if (timer<0 || timer>=SERVICE_TIME) return;
    timer=Math.min(SERVICE_TIME,timer+dt);
    const phase=timer/SERVICE_TIME;
    actor.performance.phase=phase;
    actor.carries=phase>=PICKUP && phase<RELEASE ? sheet : null;
    if (phase>=PICKUP && phase<RELEASE) {
      hinge.rotation.y=-2.89*(1-THREE.MathUtils.smoothstep(phase,PICKUP+.10,RELEASE-.03));
    } else if (phase>=RELEASE) {
      hinge.rotation.y=0;
      sheet.position.lerp(served,1-Math.exp(-dt*25));
    }
    if (phase===1) {
      sheet.position.copy(served);
      actor.performance=null;
    }
  }});
}

function woodTint(material,color) {
  const copy=material.clone();
  copy.color.setHex(color);
  return copy;
}
