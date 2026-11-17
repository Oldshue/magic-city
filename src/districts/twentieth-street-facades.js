import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, rand } from '../engine/deco-shared.js';
import { registerNightEmission } from '../engine/materials.js';
import { loadPhotoSurface, mapShopUV } from '../engine/shop-surfaces.js';
import { SHOP_HEIGHT } from './twentieth-street-stores.js';

const REVEAL = .39;
const GLASS_Z = -.29;
const ARCH_SEGMENTS = 12;

const profiles = {
  'woodward-building': {
    name: 'Woodward Building', facade: 'brick', storefrontSide: -1, year: 1902,
    bays: 6, lowerTop: 9.45, shaftRows: 7, cap: 1.15,
  },
  'american-trust-building': {
    name: 'American Trust & Savings', facade: 'ashlar', storefrontSide: 1, year: 1912,
    bays: 5, lowerTop: 12.65, shaftRows: 16, cap: 1.8,
  },
};

function stoneTint(material, color) {
  const copy = material.clone();
  copy.color.setHex(color);
  return copy;
}

function bakedOfficeWall() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const pen = canvas.getContext('2d');
  const light = pen.createRadialGradient(72, 80, 2, 70, 65, 94);
  for (const [position, color] of [[0,'#fff0d1'],[.30,'#c7aa81'],[.66,'#745e44'],[1,'#343631']]) {
    light.addColorStop(position, color);
  }
  pen.fillStyle = light;
  pen.fillRect(0, 0, 128, 128);
  const image = new THREE.CanvasTexture(canvas);
  image.colorSpace = THREE.SRGBColorSpace;
  return image;
}

export async function loadFacadeSurfaces(ctx) {
  const stone = await loadPhotoSurface(new THREE.TextureLoader(),'limestone-grain',1.28,{
    color:0xbaad95, roughness:.94, normalScale:new THREE.Vector2(.39,.39),
  });
  const glazing = new THREE.MeshPhysicalMaterial({
    color:0xb0b8b1, transparent:true, opacity:.22, depthWrite:false,
    roughness:.18, metalness:.27, clearcoat:.54, clearcoatRoughness:.18,
    envMap:ctx.environment, envMapIntensity:.66,
  });
  ctx.streetReflection?.reflect(glazing);
  const image = bakedOfficeWall();
  const plaster = new THREE.MeshStandardMaterial({color:0xa99880, roughness:.95});
  const rooms = [0xffdfab, 0xffebcc, 0xe6cfaa].map((color,i) => registerNightEmission(
    new THREE.MeshStandardMaterial({color:0xb6a28b, map:image, emissive:color, emissiveMap:image, roughness:.95}),
    .034, [.68,.46,.29][i],
  ));
  const shade = registerNightEmission(new THREE.MeshStandardMaterial({
    color:0xe3c8a0, emissive:0xffc579, roughness:.77, side:THREE.DoubleSide,
  }), .22, 2.3);
  return {
    bone:stoneTint(stone,0xd4c3a5), ashlar:stone, trim:stoneTint(stone,0xb3a08a),
    terra:stoneTint(stone,0xb2845e), granite:stoneTint(stone,0x77716a),
    glazing, plaster, rooms, shade,
    sash:new THREE.MeshStandardMaterial({color:0x343e39, metalness:.4, roughness:.49}),
    woodSash:new THREE.MeshStandardMaterial({color:0x49403a, roughness:.76}),
    terrace:new THREE.MeshStandardMaterial({color:0x7c7567, roughness:.92}),
    dark:new THREE.MeshStandardMaterial({color:0x46463b, roughness:.91}),
    linen:new THREE.MeshStandardMaterial({color:0xd9c9ad, roughness:.96, emissive:0x343025, emissiveIntensity:.12}),
    desk:new THREE.MeshStandardMaterial({color:0x554133, roughness:.78}),
    brass:new THREE.MeshStandardMaterial({color:0x92724c, metalness:.50, roughness:.44, envMap:ctx.environment}),
  };
}

function batch(face) {
  const parts = new Map();
  function put(material, geometry, name, casts = true) {
    if (material.userData.metresPerTile) mapShopUV(geometry, material.userData.metresPerTile);
    let list = parts.get(material);
    if (!list) parts.set(material, list = {geometries:[], name, casts});
    list.geometries.push(geometry);
  }

  function box(material, x, y, z, w, h, d, name, casts) {
    put(material, new THREE.BoxGeometry(w,h,d).translate(x,y,z), name, casts);
  }

  return {
    put, box,
    finish() {
      for (const [material,{geometries,name,casts}] of parts) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
        mesh.name = name;
        mesh.userData.noShadow = !casts;
        mesh.receiveShadow = material.transparent === false;
        face.add(mesh);
        for (const geometry of geometries) geometry.dispose();
      }
    },
  };
}

function aperture({x, bottom, top, width, rise = 0}, border = 0) {
  const half = width/2 + border;
  const points = [[x-half,bottom-border],[x+half,bottom-border]];
  if (rise) {
    const spring = top - rise;
    for (let i=0; i<=ARCH_SEGMENTS; i++) {
      const angle = Math.PI * i/ARCH_SEGMENTS;
      points.push([x+Math.cos(angle)*half,spring+Math.sin(angle)*(rise+border)]);
    }
  } else points.push([x+half,top+border],[x-half,top+border]);
  return points.map(([px,py])=>new THREE.Vector2(px,py));
}

function wall(B, material, width, bottom, top, openings) {
  const outline = new THREE.Shape(aperture({x:0, bottom, top, width}));
  outline.holes = openings.map(opening=>new THREE.Path(aperture(opening)));
  const geometry = new THREE.ExtrudeGeometry(outline,{depth:REVEAL,bevelEnabled:false});
  B.put(material,geometry.translate(0,0,-REVEAL),'Masonry with window openings');
}

function ledge(B, material, width, y, height, projection) {
  B.box(material, 0,y,projection/2-.02,width+2*projection,height,projection+.08,'Stone courses');
}

function casing(B, material, opening, border) {
  const ring = new THREE.Shape(aperture(opening,border));
  ring.holes.push(new THREE.Path(aperture(opening,.018)));
  B.put(material, new THREE.ExtrudeGeometry(ring,{depth:.13,bevelEnabled:false}).translate(0,0,-.025),
    'Window surrounds');
}

function sashBar(B, material, x1,y1,x2,y2, depth, width) {
  const angle = Math.atan2(y2-y1,x2-x1);
  const line = new THREE.BoxGeometry(Math.hypot(x2-x1,y2-y1),width,.047);
  B.put(material,line.rotateZ(angle).translate((x1+x2)/2,(y1+y2)/2,depth),'Window sashes');
}

function recessedWindow(B, M, opening, options) {
  const {x,bottom,top,width,rise=0} = opening;
  const {sash, base, frame, detailed, random} = options;
  const half = width/2, height = top-bottom;
  const midY = (top+bottom)/2;
  const spring = top-rise;
  const glass = new THREE.ShapeGeometry(new THREE.Shape(aperture(opening)));
  B.put(M.glazing,glass.translate(0,0,GLASS_Z),'Recessed glass',false);

  const bar = (x1,y1,x2,y2,thickness=.05)=>sashBar(B,sash,x1,y1,x2,y2,GLASS_Z+.025,thickness);
  bar(x-half,bottom+.045,x+half,bottom+.045,.088);
  bar(x-half,bottom,x-half, spring,.09);
  bar(x+half,bottom,x+half,spring,.09);
  if (rise) {
    bar(x-half,spring,x+half,spring,.10);
    for (let i=1;i<ARCH_SEGMENTS;i+=2) {
      const angle = i/ARCH_SEGMENTS * Math.PI;
      bar(x,spring,x+Math.cos(angle)*(half-.04),spring+Math.sin(angle)*(rise-.03),.029);
    }
    bar(x,bottom,x,spring,.093);
  } else {
    bar(x-half,top-.04,x+half,top-.04,.081);
    bar(x-half,bottom+height*.61,x+half,bottom+height*.61,.065);
    if (base) {
      for (const offset of [-.27,.27]) bar(x+width*offset,bottom,x+width*offset,top,.068);
    } else if (detailed) bar(x,bottom,x,top,.056);
  }

  B.box(frame,x,bottom-.062,.067,width+.32,.124,.34,'Window sills');
  B.box(frame,x,bottom-.158,.037,width+.22,.084,.19,'Window sills');

  // Room pockets have their own walls and ceiling behind the opening. Small props
  // on street-level rooms stay in view as the player walks past them.
  const depth = detailed ? 1.64 : .83;
  const roomZ = -.42-depth/2;
  const occupied = random() < (detailed ? .52 : .26);
  const back = occupied ? M.rooms[Math.floor(random()*M.rooms.length)] : M.dark;
  const pocketHeight = height+.56;
  const rear = -.385-depth;
  B.put(back,new THREE.PlaneGeometry(width+.10,pocketHeight).translate(x,midY,rear),
    occupied ? 'Lit office walls' : 'Unlit office walls',false);
  for (const [y,turn] of [[top+.21,1],[bottom-.20,-1]]) {
    B.put(M.plaster,new THREE.PlaneGeometry(width+.13,depth).rotateX(turn*Math.PI/2).translate(x,y,roomZ),
      'Office floors and ceilings',false);
  }
  for (const side of [-1,1]) {
    const returnWall = new THREE.PlaneGeometry(depth,pocketHeight).rotateY(-side*Math.PI/2);
    B.put(M.plaster,returnWall.translate(x+side*half,midY,roomZ),'Office wall returns',false);
  }

  const rolled = random();
  if (rolled > .27) {
    const drop = Math.min(height*.68,.28+(rolled-.27)*1.6);
    const linenTop = rise ? spring-.045 : top-.06;
    B.box(M.linen,x,linenTop-drop/2,-.51,width-.16,drop,.027,'Linen roller shades',false);
    B.box(sash,x,linenTop-drop,-.49,width-.12,.036,.039,'Window sashes');
  }
  if (!detailed) return;
  const side = random()<.5 ? 1 : -1;
  const lx = x+side*width*.225;
  B.box(M.desk,x-.14,bottom+.44,-1.4,width*.69,.10,.54,'Office furniture',false);
  for (const offset of [-.28,.28]) {
    B.box(M.desk,x+width*offset,bottom+.1,-1.42,.082,.61,.36,'Office furniture',false);
  }
  B.box(M.linen,x-width*.11,bottom+.50,-1.39,.29,.017,.40,'Desk papers',false);
  if (occupied) {
    const foot = new THREE.CylinderGeometry(.12,.14,.045,10).translate(lx,bottom+.51,-1.38);
    const stem = new THREE.CylinderGeometry(.025,.031,.39,8).translate(lx,bottom+.718,-1.38);
    const shade = new THREE.CylinderGeometry(.115,.234,.196,14,1,true).translate(lx,bottom+.96,-1.38);
    B.put(M.brass,foot,'Lamp bases',false);
    B.put(M.brass,stem,'Lamp bases',false);
    B.put(M.shade,shade,'Office desk lamps',false);
    if (rise) {
      const canopyY = top + .21;
      const dropY = spring - .22;
      const cord = new THREE.CylinderGeometry(.024,.024,canopyY-dropY,8)
        .translate(x,(canopyY+dropY)/2,-.92);
      const globe = new THREE.SphereGeometry(.19,12,8)
        .scale(1,.61,1).translate(x,dropY-.066,-.92);
      B.put(M.brass,cord,'Pendant stems',false);
      B.put(M.shade,globe,'Opal pendant lamps',false);
    }
  }
}

function bays(width,count,bottom,top,fraction,rise=0) {
  const stride = (width-.78)/count;
  return Array.from({length:count}, (_,i)=>({
    x:(i-(count-1)/2)*stride, bottom, top, width:stride*fraction, rise,
  }));
}

function baseMasonry(B, M, profile, width, openings) {
  const isBank = profile.facade==='ashlar';
  const plasterStart = SHOP_HEIGHT+.12;
  const top = profile.lowerTop-.28;
  const stride = openings[1].x-openings[0].x;
  const count = openings.length;
  for (let i=0;i<=count;i++) {
    const x=(i-count/2)*stride;
    const column = isBank ? .78 : .56;
    const rows = Math.ceil((top-plasterStart)/.56);
    const spacing = (top-plasterStart)/rows;
    for (let r=0;r<rows;r++) {
      const panel = r%6===3 ? M.trim : M.bone;
      B.box(panel,x,plasterStart+(r+.5)*spacing,.105,column,spacing-.025,.25,'Rusticated piers');
    }
    B.box(M.granite,x,plasterStart+.23,.19,column+.20,.25,.40,'Pier bases');
    B.box(M.bone,x,top-.17,.20,column+.27,.23,.39,'Pier capitals');
    B.box(M.trim,x,top+.028,.22,column+.42,.12,.45,'Pier capitals');
  }
  for (const opening of openings) {
    casing(B, isBank ? M.bone : M.terra, opening, isBank ? .19 : .13);
    if (isBank) {
      B.box(M.bone,opening.x,opening.top+.13,.139,.24,.38,.27,'Arch keystones');
      const spring = opening.top-opening.rise;
      for (const side of [-1,1]) B.box(M.trim,opening.x+side*(opening.width/2+.11),spring,.133,.38,.13,.24,
        'Arch spring stones');
    } else {
      B.box(M.trim,opening.x,opening.top+.18,.11,opening.width+.43,.15,.30,'Terra cotta headers');
    }
  }
  ledge(B,M.granite,width,SHOP_HEIGHT+.14,.25,.20);
  ledge(B,M.bone,width,profile.lowerTop-.11,.24,.27);
  ledge(B,M.trim,width,profile.lowerTop+.083,.16,.36);
}

function cornice(B,M,width,height,profile) {
  const bank = profile.facade === 'ashlar';
  const crown = bank ? M.bone : M.terra;
  ledge(B,M.trim,width,height-.78,.18,.18);
  const span = width-.25;
  const dentils = Math.round(span/.63);
  for (let i=0;i<dentils;i++) {
    const x=(i+.5)*span/dentils-span/2;
    B.box(crown,x,height-.465,.225,.285,.39,.44,'Cornice brackets');
    B.box(M.trim,x,height-.675,.15,.194,.12,.26,'Cornice brackets');
  }
  ledge(B,crown,width,height-.24,.19,.38);
  ledge(B,M.bone,width,height-.078,.145,.45);
}

function sideGround(B,M,width,signSide,random) {
  const openings = bays(width,5,.68,3.36,.62);
  if (signSide) {
    openings[2].bottom = .13;
    openings[2].width += .55;
  }
  wall(B,M.granite,width,0,SHOP_HEIGHT,openings);
  for (const [i,opening] of openings.entries()) {
    casing(B,M.trim,opening,.14);
    recessedWindow(B,M,opening,{sash:M.sash, base:false, frame:M.granite, detailed:false, random});
    if (i===2 && signSide) {
      B.box(M.sash,0,.62,GLASS_Z-.02,opening.width-.02,.99,.105,'Closed entrance doors');
      B.box(M.brass,.11,1.26,GLASS_Z+.063,.038,.21,.05,'Entrance handles');
      B.box(M.brass,-.11,1.26,GLASS_Z+.063,.038,.21,.05,'Entrance handles');
    }
  }
  if (signSide) {
    const doorway = openings[2].width + .26;
    const side = (width-doorway)/2;
    for (const sign of [-1,1]) {
      B.box(M.trim,sign*(doorway+side)/2,.37,.10,side,.48,.29,'Stone plinth');
    }
    B.box(M.granite,0,.076,.104,doorway+.14,.15,.41,'Doorstep');
  } else ledge(B,M.trim,width,.37,.48,.22);
}

function elevation(ctx, landmark, profile, width, adjacent, rotation, M, index) {
  const face = new THREE.Group();
  face.rotation.y = rotation;
  face.position.set(Math.sin(rotation)*adjacent/2,0,Math.cos(rotation)*adjacent/2);
  const primary = rotation === profile.storefrontSide * Math.PI/2;
  face.name = primary ? '20th Street elevation' : rotation === Math.PI ? 'First Avenue elevation' : 'Side elevation';
  const bank = profile.facade==='ashlar';
  const random = rand(profile.year*17+index*207);
  const B = batch(face);
  const low = bays(width,profile.bays,SHOP_HEIGHT+.96,profile.lowerTop-1.04,bank ? .63 : .67,bank ? 1.2 : 0);
  wall(B,M.ashlar,width,SHOP_HEIGHT,profile.lowerTop,low);
  baseMasonry(B,M,profile,width,low);

  const upperBase = profile.lowerTop;
  const atticBase = landmark.height-profile.cap-3.23;
  const rowHeight = (atticBase-upperBase)/profile.shaftRows;
  const shaft = [];
  for (let i=0;i<profile.shaftRows;i++) {
    const y = upperBase+i*rowHeight;
    const row = bays(width,bank ? 7 : 6,y+rowHeight*.20,y+rowHeight*.80,bank ? .58 : .65);
    shaft.push(...row);
    if (i===0 || (bank && i%5===0)) ledge(B,M.trim,width,y+.11,.16,.15);
  }
  const attic = bays(width,bank ? 7 : 6,atticBase+.51,landmark.height-profile.cap-.27,.52,bank ? 0 : .53);
  wall(B,bank ? M.bone : M.brick,width,upperBase,atticBase,shaft);
  wall(B,bank ? M.ashlar : M.brick,width,atticBase,landmark.height,attic);
  ledge(B,bank ? M.trim : M.terra,width,atticBase+.07,.24,.28);
  for (const opening of attic) casing(B,bank ? M.bone : M.terra,opening,.145);
  for (const opening of [...low,...shaft,...attic]) {
    recessedWindow(B,M,opening,{
      sash:bank ? M.sash : M.woodSash, base:low.includes(opening),
      frame:bank ? M.trim : M.terra, detailed:opening.bottom<19 && (primary || rotation===Math.PI), random,
    });
  }

  if (!primary) {
    sideGround(B,M,width,rotation===Math.PI,random);
    if (rotation===Math.PI) {
      const sign = ctx.deco.canvasSign(profile.name.toUpperCase(),{
        width:bank ? 11 : 8, canvasWidth:1024, canvasHeight:74, colors:['#393731','#9f835f','#e6d3ad'],
      });
      sign.position.set(0,3.94,.18);
      face.add(sign);
    }
  }
  cornice(B,M,width,landmark.height,profile);
  B.finish();
  return face;
}

export function build20thStreetLandmark(ctx, landmark, M) {
  const profile = profiles[landmark.id];
  const [width,depth] = landmark.footprint;
  const tower = new THREE.Group();
  tower.name = profile.name;
  tower.position.set(landmark.position[0],0,landmark.position[1]);
  tower.rotation.y = (landmark.rotationYDeg || 0)*Math.PI/180;
  const facades = [0,Math.PI/2,Math.PI,-Math.PI/2];
  for (const [i,rotation] of facades.entries()) {
    const edge = i%2!==0;
    tower.add(elevation(ctx,landmark,profile,edge ? depth : width,edge ? width : depth,rotation,M,i));
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width,.26,depth),M.terrace);
  roof.position.y = landmark.height-.225;
  roof.name = 'Flat roof and cornice';
  tower.add(roof);
  const roofKit = ctx.deco.rooftopKit({footprintW:width*.69,footprintD:depth*.69,seed:profile.year});
  roofKit.position.y = landmark.height-.095;
  tower.add(roofKit);
  return tower;
}
