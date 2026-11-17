import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, rand } from '../engine/deco-shared.js';
import { registerNightEmission } from '../engine/materials.js';
import { loadPhotoSurface, mapShopUV } from '../engine/shop-surfaces.js';
import { SHOP_HEIGHT } from './twentieth-street-stores.js';
import { addBrownMarxLobby, lobbyDimensions } from './brown-marx-lobby.js';

const REVEAL = .39;
const GLASS_Z = -.29;
const ARCH_SEGMENTS = 12;

const profiles = {
  'woodward-building': {
    name:'Woodward Building', year:1902, streetSide:-1, firstAvenue:Math.PI, shops:true,
    bays:6, upperBays:6, lowerTop:9.45, shaftRows:7, cap:1.15, atticRise:.53,
    base:'ashlar', shaft:'brick', crown:'brick', ornament:'terra', sash:'woodSash',
  },
  'american-trust-building': {
    name:'American Trust & Savings', year:1912, streetSide:1, firstAvenue:Math.PI, shops:true,
    bays:5, upperBays:7, lowerTop:12.65, shaftRows:16, cap:1.8, lowerRise:1.2, courses:5,
    base:'ashlar', shaft:'bone', crown:'ashlar', ornament:'trim', sash:'sash',
  },
  'brown-marx-building': {
    name:'Brown-Marx Building', year:1906, streetSide:1, firstAvenue:0, lobby:true,
    bays:7, upperBays:8, groundTop:7.35, lowerTop:12.75, shaftRows:12, cap:1.15,
    lowerRise:.73, atticRise:.40, courses:6,
    base:'brownstone', shaft:'buffBrick', crown:'buffBrick', ornament:'copper', sash:'woodSash',
  },
  'empire-building': {
    name:'Empire Building', year:1909, streetSide:-1, firstAvenue:0, glazed:true,
    bays:5, upperBays:7, groundTop:5.33, lowerTop:10.95, shaftRows:11, cap:1.52,
    lowerRise:.75, atticRise:.55, atticRows:2, atticHeight:7.4, courses:3,
    base:'glazedStone', shaft:'glazedStone', crown:'glazedStone', ornament:'ivory', sash:'sash',
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
  const loader = new THREE.TextureLoader();
  const [stone, buffBrick] = await Promise.all([
    loadPhotoSurface(loader,'limestone-grain',1.28,{
      color:0xbaad95, roughness:.94, normalScale:new THREE.Vector2(.39,.39),
    }),
    loadPhotoSurface(loader,'brown-brick',1.03,{
      color:0xd7c0a4, roughness:.93, normalScale:new THREE.Vector2(.50,.50),
    }),
  ]);
  const glazedStone = stoneTint(stone,0xe6dcc0);
  glazedStone.roughness = .39;
  glazedStone.normalScale.set(.25,.25);
  glazedStone.envMap = ctx.environment;
  glazedStone.envMapIntensity = .24;
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
    glazing, plaster, rooms, shade, buffBrick, glazedStone,
    ivory:stoneTint(glazedStone,0xf4e9cd), brownstone:stoneTint(stone,0xad8973),
    accent:new THREE.MeshStandardMaterial({color:0x3f6254,roughness:.39,metalness:.08}),
    clay:new THREE.MeshStandardMaterial({color:0xb68c5c,roughness:.44,metalness:.14}),
    copper:new THREE.MeshStandardMaterial({color:0x584a3b,roughness:.54,metalness:.47,envMap:ctx.environment,envMapIntensity:.35}),
    lobbyPlaster:registerNightEmission(new THREE.MeshStandardMaterial({
      color:0xd1b894, emissive:0x795633, roughness:.87,
    }),.20,.68),
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
  const arched = Boolean(profile.lowerRise);
  const stone = M[profile.base];
  const pale = profile.glazed ? M.ivory : profile.lobby ? M.brownstone : M.bone;
  const plasterStart = (profile.groundTop ?? SHOP_HEIGHT)+.12;
  const top = profile.lowerTop-.28;
  const stride = openings[1].x-openings[0].x;
  const count = openings.length;
  for (let i=0;i<=count;i++) {
    const x=(i-count/2)*stride;
    const column = arched ? .78 : .56;
    const rows = Math.ceil((top-plasterStart)/.56);
    const spacing = (top-plasterStart)/rows;
    for (let r=0;r<rows;r++) {
      const panel = r%6===3 ? stone : pale;
      B.box(panel,x,plasterStart+(r+.5)*spacing,.105,column,spacing-.025,.25,'Rusticated piers');
    }
    B.box(M.granite,x,plasterStart+.23,.19,column+.20,.25,.40,'Pier bases');
    B.box(pale,x,top-.17,.20,column+.27,.23,.39,'Pier capitals');
    B.box(M.trim,x,top+.028,.22,column+.42,.12,.45,'Pier capitals');
  }
  for (const opening of openings) {
    casing(B, arched ? pale : M.terra, opening, arched ? .19 : .13);
    if (arched) {
      B.box(pale,opening.x,opening.top+.13,.139,.24,.38,.27,'Arch keystones');
      const spring = opening.top-opening.rise;
      for (const side of [-1,1]) B.box(M.trim,opening.x+side*(opening.width/2+.11),spring,.133,.38,.13,.24,
        'Arch spring stones');
    } else {
      B.box(M.trim,opening.x,opening.top+.18,.11,opening.width+.43,.15,.30,'Terra cotta headers');
    }
  }
  ledge(B,M.granite,width,plasterStart+.02,.25,.20);
  ledge(B,pale,width,profile.lowerTop-.11,.24,.27);
  ledge(B,M.trim,width,profile.lowerTop+.083,.16,.36);
}

function cornice(B,M,width,height,profile) {
  const crown = profile.shops && profile.lowerRise ? M.bone : M[profile.ornament];
  ledge(B,M.trim,width,height-.78,.18,.18);
  const span = width-.25;
  const dentils = Math.round(span/.63);
  for (let i=0;i<dentils;i++) {
    const x=(i+.5)*span/dentils-span/2;
    B.box(crown,x,height-.465,.225,.285,.39,.44,'Cornice brackets');
    B.box(M.trim,x,height-.675,.15,.194,.12,.26,'Cornice brackets');
  }
  ledge(B,crown,width,height-.24,.19,.38);
  ledge(B,profile.lobby ? M.copper : M.bone,width,height-.078,.145,.45);
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

function registerFootprint(ctx, face, rectangles) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  ctx.controls.addColliders(rectangles.map(([left,right,back,front])=>{
    face.localToWorld(a.set(left,0,back));
    face.localToWorld(b.set(right,0,front));
    return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};
  }));
}

function polishEmpire(B, M, width, openingRows, bottom, top) {
  const row = openingRows[0];
  const stride = row[1].x-row[0].x;
  const height = top-bottom-.69;
  for (let i=0;i<=row.length;i++) {
    const x=(i-row.length/2)*stride;
    B.box(M.ivory,x,bottom+.22,.187,.72,.33,.50,'Classical column plinths');
    B.box(M.ivory,x,top-.36,.17,.77,.26,.53,'Glazed capitals');
    const shaft = new THREE.CylinderGeometry(.215,.277,height,12)
      .translate(x,bottom+.37+height/2,.078);
    B.put(M.glazedStone,shaft,'Engaged columns');
    for (const offset of [-.126,0,.126]) {
      B.box(M.ivory,x+offset,bottom+.37+height/2,.242,.039,height-.03,.087,'Column flutes');
    }
    B.box(M.accent,x,top-.15,.23,.54,.25,.16,'Polychrome frieze');
    B.put(M.clay,new THREE.BoxGeometry(.145,.145,.088).rotateZ(Math.PI/4)
      .translate(x,top-.152,.328),'Terracotta medallions');
  }
  ledge(B,M.ivory,width,top+.028,.16,.43);
}

function cornerGround(ctx, B, M, face, profile, width, depth, isFirst, random) {
  const height = profile.groundTop;
  const openings = bays(width,5,.71,height-.89,.68,profile.glazed ? .68 : .23);
  const doorway = openings[2];
  if (isFirst) {
    doorway.bottom = .158;
    doorway.top = height-.63;
    doorway.rise = profile.glazed ? .71 : .37;
    doorway.width += .25;
  }
  const lobby = isFirst && profile.lobby;
  wall(B,M[profile.base],width,0,height,openings);
  for (const opening of openings) {
    casing(B,M[profile.glazed ? 'ivory' : 'trim'],opening,.16);
    if (opening === doorway && lobby) {
      const transom = {...doorway,bottom:4.02};
      const glass = new THREE.ShapeGeometry(new THREE.Shape(aperture(transom)));
      B.put(M.glazing,glass.translate(0,0,-.26),'Lobby transom',false);
      for (const x of [-1.05,0,1.05]) {
        B.box(M.sash,x,(transom.bottom+transom.top-.11)/2,-.23,.052,transom.top-transom.bottom-.11,.06,'Transom mullions');
      }
      continue;
    }
    recessedWindow(B,M,opening,{sash:M[profile.sash],base:true,frame:M[profile.ornament],detailed:isFirst,random});
    if (opening === doorway && isFirst) {
      B.box(M.sash,0,.64,-.28,opening.width-.04,1.03,.096,'Closed entrance');
      for (const x of [-.16,.16]) B.box(M.brass,x,1.19,-.218,.044,.29,.048,'Brass door pulls');
    }
  }
  if (profile.glazed) {
    polishEmpire(B,M,width,[openings],.16,height-.33);
    for (const opening of openings) {
      if (isFirst && opening===doorway) continue;
      const ribbon = opening.width*.84;
      B.box(M.accent,opening.x,height-.47,.117,ribbon,.30,.12,'Glazed entrance frieze');
      for (let i=-2;i<=2;i++) {
        const tile = new THREE.BoxGeometry(.15,.15,.063).rotateZ(Math.PI/4);
        B.put(M.clay,tile.translate(opening.x+ribbon*i/5.3,height-.47,.197),'Frieze ceramic diamonds');
      }
    }
  } else {
    const stride = openings[1].x-openings[0].x;
    for (let i=0;i<=openings.length;i++) {
      const x=(i-openings.length/2)*stride;
      B.box(M.brownstone,x,height*.50,.14,.69,height-.51,.35,'Two-storey brownstone pilasters');
      B.box(M.trim,x,height-.26,.18,1.04,.24,.44,'Pilaster capitals');
      B.box(M.granite,x,.37,.19,.93,.56,.47,'Brownstone plinths');
    }
  }

  if (!isFirst) return;
  const left = -width/2, right = width/2;
  if (lobby) {
    const {halfWidth,depth:lobbyDepth} = lobbyDimensions;
    registerFootprint(ctx,face,[
      [left,-halfWidth,-depth,0],[halfWidth,right,-depth,0],
      [-halfWidth,halfWidth,-depth,-lobbyDepth+.14],
      ...addBrownMarxLobby(ctx,face,B,M,doorway),
    ]);
  } else registerFootprint(ctx,face,[[left,right,-depth,0]]);
}

function elevation(ctx, tower, landmark, profile, width, adjacent, rotation, M, index) {
  const face = new THREE.Group();
  face.rotation.y = rotation;
  face.position.set(Math.sin(rotation)*adjacent/2,0,Math.cos(rotation)*adjacent/2);
  tower.add(face);
  const primary = rotation === profile.streetSide * Math.PI/2;
  const isFirst = rotation === profile.firstAvenue;
  face.name = primary ? '20th Street elevation' : isFirst ? 'First Avenue elevation' : 'Side elevation';
  const fieldTop = profile.groundTop ?? SHOP_HEIGHT;
  const random = rand(profile.year*17+index*207);
  const B = batch(face);
  const low = bays(width,profile.bays,fieldTop+.96,profile.lowerTop-1.04,
    profile.lowerRise ? .63 : .67,profile.lowerRise);
  wall(B,M[profile.base],width,fieldTop,profile.lowerTop,low);
  baseMasonry(B,M,profile,width,low);

  const upperBase = profile.lowerTop;
  const atticHeight = profile.atticHeight ?? 3.23;
  const atticBase = landmark.height-profile.cap-atticHeight;
  const rowHeight = (atticBase-upperBase)/profile.shaftRows;
  const shaft = [];
  for (let i=0;i<profile.shaftRows;i++) {
    const y = upperBase+i*rowHeight;
    shaft.push(...bays(width,profile.upperBays,y+rowHeight*.20,y+rowHeight*.80,profile.lowerRise ? .58 : .65));
    if (i===0 || (profile.courses && i%profile.courses===0)) ledge(B,M.trim,width,y+.11,.16,.15);
  }
  const atticRows = profile.atticRows ?? 1;
  const attic = [];
  for (let i=0;i<atticRows;i++) {
    const y = atticBase+i*atticHeight/atticRows;
    attic.push(bays(width,profile.upperBays,y+.51,y+atticHeight/atticRows-.27,.52,profile.atticRise));
  }
  const atticWindows = attic.flat();
  wall(B,M[profile.shaft],width,upperBase,atticBase,shaft);
  wall(B,M[profile.crown],width,atticBase,landmark.height,atticWindows);
  ledge(B,M[profile.ornament],width,atticBase+.07,.24,.28);
  for (const opening of atticWindows) casing(B,M[profile.ornament],opening,.145);
  if (profile.glazed) polishEmpire(B,M,width,attic,atticBase+.23,landmark.height-profile.cap);
  for (const opening of [...low,...shaft,...atticWindows]) {
    recessedWindow(B,M,opening,{
      sash:M[profile.sash], base:low.includes(opening),
      frame:M[profile.ornament], detailed:opening.bottom<19 && (primary || isFirst), random,
    });
  }

  if (!profile.shops) {
    cornerGround(ctx,B,M,face,profile,width,adjacent,isFirst,random);
  } else if (!primary) sideGround(B,M,width,isFirst,random);
  if (isFirst && !primary) {
    const sign = ctx.deco.canvasSign(profile.name.toUpperCase(),{
      width:profile.shops && profile.lowerRise ? 11 : 8, canvasWidth:1024, canvasHeight:74,
      colors:['#393731','#9f835f','#e6d3ad'],
    });
    sign.position.set(0,profile.groundTop ? profile.groundTop-.33 : 3.94,.23);
    face.add(sign);
  }
  cornice(B,M,width,landmark.height,profile);
  B.finish();
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
    elevation(ctx,tower,landmark,profile,edge ? depth : width,edge ? width : depth,rotation,M,i);
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
