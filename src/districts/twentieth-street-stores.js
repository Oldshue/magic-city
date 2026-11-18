import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../engine/deco-shared.js';
import { SIDEWALK_HEIGHT } from '../engine/street-layout.js';
import { mapShopUV } from '../engine/shop-surfaces.js';
import { SHOP_MENUS } from '../gameplay/shop-state.mjs';
import { buildCounterFixture, STAFF_Z } from './counter-fixtures.js';
import { buildWalkerFixture, loadWalkerWindows } from './walker-tailoring.js';
import { buildStorefrontDisplay, makeDisplayMaterials } from './storefront-windows.js';

export const SHOP_HEIGHT = 4.56;
export const SHOP_DEPTH = 4.72;

const STORES = [
  {
    landmark: 'american-trust-building', bay: -1, name: 'American Trust Exchange',
    subtitle: 'COMMERCIAL ACCOUNTS · LETTERS OF CREDIT', kind: 'bank',
    paint: 0x282b29, model: 'bank-clerk', open: true,
    copy: 'Commercial deposits close at four. A Birmingham bill of exchange clears in New Orleans by Friday. The teller turns one page in a red leather ledger.',
  },
  {
    landmark: 'american-trust-building', bay: 1, name: 'Crown Lunch Counter',
    subtitle: 'COFFEE 15¢ · SANDWICHES 10¢', kind: 'lunch',
    paint: 0x663126, model: 'crown-proprietor', open: true,
  },
  {
    landmark: 'woodward-building', bay: -1, name: 'Walker Tailoring',
    subtitle: 'WOOLENS · ALTERATIONS WHILE YOU WAIT', kind: 'tailor',
    paint: 0x3e382e, model: 'walker-tailor', open: true,
    copy: 'A length of blue serge lies over the tailor’s buck. Pin a note inside your coat if you want the work delivered to Terminal Station.',
  },
  {
    landmark: 'woodward-building', bay: 1, name: 'Heaviest Corner Drug Co.',
    subtitle: 'PRESCRIPTIONS · SUNDRIES · SODA', kind: 'chemist',
    paint: 0x284441, model: 'pharmacist', open: true,
  },
];

function interiorMaterial(color, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({color, roughness, emissive:color, emissiveIntensity:0.19});
}

function makeShopMaterials(surfaces, reflection) {
  return {
    ...surfaces,
    display:makeDisplayMaterials(reflection),
    oxblood:interiorMaterial(0x633634,.53),
    wood: interiorMaterial(0x4a2c20),
    plaster: interiorMaterial(0xd0b48a, 0.89),
    stone: interiorMaterial(0x9c9280, 0.61),
    tile: interiorMaterial(0x242d2c),
    brass: new THREE.MeshStandardMaterial({
      color:0xbb8d55, metalness:0.73, roughness:0.47, envMap:reflection, envMapIntensity:0.55,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color:0xd8ded1, metalness:0.12, roughness:0.19, envMap:reflection, envMapIntensity:0.43,
      clearcoat:0.6, side:THREE.DoubleSide, opacity:0.24, transparent:true, depthWrite:false,
      forceSinglePass:true,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color:0xffe5b9, emissive:0xffcd81, emissiveIntensity:1.65, roughness:0.72,
    }),
    amber: interiorMaterial(0x955734, 0.29),
    moss: interiorMaterial(0x366150, 0.46),
    paper: interiorMaterial(0xa28e67, 0.88),
    linen: interiorMaterial(0xc3ba9e, 0.84),
    navy: interiorMaterial(0x34424b, 0.83),
  };
}

function roomContents(put, box, M) {
  // Shelving and a marble-topped counter keep the goods off the panes.
  box(M.wood, 0,0.47,-2.65,2.75,0.94,0.65);
  box(M.stone, 0,0.96,-2.65,2.91,0.10,0.77);
  for (const side of [-1, 1]) {
    box(M.wood, side * 3.62,1.43,-SHOP_DEPTH+.17,1.82,2.85,0.15);
    for (let row = 0; row < 4; row++) {
      box(M.wood, side * 3.62,0.56 + row * 0.47,-SHOP_DEPTH+.39,1.70,0.06,0.47);
    }
  }

  for (const x of [-3.2, 0, 3.2]) {
    box(M.paper,x,1.26,-1.60,.57,.46,.046);
    box(M.wood,x,.84,-1.62,1.15,.09,.52);
    box(M.brass,x,.50,-1.60,.06,.76,.07);
  }
  for (let i = 0; i < 7; i++) {
    box(i % 2 ? M.moss : M.navy,2.83 + i*.20,.74,-2.93,.148,.33,.26);
  }
}

function makeShop(spec, width, ctx, M, garments) {
  const shop = new THREE.Group();
  shop.name = spec.name;
  const paint = interiorMaterial(spec.paint, 0.70);
  const serviceMenu = SHOP_MENUS[spec.kind];
  const pharmacy = spec.kind==='chemist';
  const tailor = spec.kind==='tailor';
  const recess = tailor ? -.69 : 0;
  const parts = new Map(), furniture = [], displays = [];
  const displayWindows = pharmacy || spec.kind==='lunch';
  const plaster = pharmacy ? M.display.chemistPlaster : displayWindows ? M.display.crownPlaster : M.plaster;
  const put = (material, geometry) => {
    if (material.userData.metresPerTile) mapShopUV(geometry,material.userData.metresPerTile);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  };
  const box = (material, x,y,z,w,h,d) => put(material, new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  const panel = (material, x,y,z,w,h) => put(material, new THREE.PlaneGeometry(w,h).translate(x,y,z));

  // Continuous floor and rear wall, with a sheltered display on either side of the doorway.
  const w = width / 2;
  const casing = 0.21;
  const doorHalf = 0.79;
  const head = 2.82;
  const sill = 0.57;
  box(tailor ? M.walnut : serviceMenu ? pharmacy ? M.checker : M.lunchFloor : M.stone,
    0,-0.028,-SHOP_DEPTH/2,width,.055,SHOP_DEPTH);
  box(plaster,0,2.06,-SHOP_DEPTH+.059,width,4.12,.095);
  const rear = -SHOP_DEPTH + .12;
  const wainscot = serviceMenu ? pharmacy ? M.jade : M.milk : paint;
  box(wainscot,0,.72,rear,width,1.44,.026);
  box(M.walnut,0,.079,rear+.018,width,.10,.045);
  box(paint,0,1.456,rear+.023,width,.073,.051);
  if (serviceMenu) {
    for (const side of [-1,1]) {
      box(wainscot,side*(w-.256),.72,-SHOP_DEPTH/2,.034,1.44,SHOP_DEPTH-.25);
      box(paint,side*(w-.224),1.456,-SHOP_DEPTH/2,.065,.071,SHOP_DEPTH-.28);
    }
  }
  box(plaster,0,4.27,-SHOP_DEPTH/2,width,.16,SHOP_DEPTH);
  box(M.stone,0,.05,.052,width,.10,.43);
  box(M.wood,0,3.91,.012,width,.70,.26);
  box(M.brass,0,3.48,.154,width,.023,.031);
  box(M.brass,0,4.19,.155,width,.023,.032);
  box(M.stone,0,4.337,.028,width,.129,.33);
  for (const side of [-1,1]) {
    box(M.brick,side*(w-.12),2.15,-SHOP_DEPTH/2,.24,4.30,SHOP_DEPTH+.13);
    const displayWidth = w - doorHalf - casing;
    const mid = side * (doorHalf + displayWidth / 2);
    if (displayWindows) {
      const display = buildStorefrontDisplay({kind:spec.kind,shop,put,box,materials:M,
        paint,mid,width:displayWidth,sill,head,side});
      displays.push(display);
      furniture.push(display.collision);
      continue;
    }
    box(M.wood,mid,sill/2,.012,displayWidth,sill,.25);
    box(M.stone,mid,sill,.082,displayWidth+.05,.075,.34);
    const mullions = tailor ? 2 : 4;
    for (let j = 0; j <= mullions; j++) {
      const x = side * (doorHalf + displayWidth * j/mullions);
      box(paint,x,(sill+head)/2,.135,.053,head-sill+.04,.058);
      box(M.brass,x,(sill+head)/2,.168,.010,head-sill+.03,.012);
    }
    panel(M.glass,mid,(sill+head)/2,.102,displayWidth-.02,head-sill);
    box(paint,mid,head,.133,displayWidth,.068,.11);
    panel(M.glass,mid,3.17,.106,displayWidth,.54);
    for (let j = 1; j < 9; j++) {
      const x = side * (doorHalf + displayWidth * j/9);
      box(paint,x,3.17,.151,.035,.58,.047);
    }
  }

  for (const side of [-1,1]) {
    box(paint,side*doorHalf,1.43,recess+.09,.145,2.87,.18);
    box(M.brass,side*(doorHalf-.047),1.45,recess+.202,.018,2.84,.016);
    if (tailor) {
      const innerX = side * doorHalf, outerX = side * (doorHalf + .224);
      const innerZ = recess + .09, outerZ = .11;
      const length = Math.hypot(outerX-innerX, outerZ-innerZ);
      const angle = Math.atan2(-(outerZ-innerZ), outerX-innerX);
      const x = (innerX+outerX)/2, z = (innerZ+outerZ)/2;
      put(M.glass,new THREE.PlaneGeometry(length,2.255).rotateY(angle).translate(x,1.685,z));
      for (const y of [.548,2.824]) {
        put(M.walnut,new THREE.BoxGeometry(length+.028,.065,.095).rotateY(angle).translate(x,y,z));
        put(M.brass,new THREE.BoxGeometry(length+.028,.013,.104).rotateY(angle).translate(x,y+.038,z));
      }
      put(M.walnut,new THREE.BoxGeometry(length,.54,.09).rotateY(angle).translate(x,.268,z));
      furniture.push([Math.min(innerX,outerX)-.046,Math.max(innerX,outerX)+.046,innerZ-.037,outerZ+.02]);
    }
  }
  box(paint,0,2.83,recess+.087,1.68,.14,.20);
  panel(M.glass,0,3.15,recess+.105,1.42,.50);
  if (tailor) {
    box(M.marble,0,-.005,-.308,1.71,.023,.727);
    box(M.brass,0,.016,.02,1.65,.015,.059);
    box(M.walnut,0,2.932,-.271,1.70,.067,.758);
  }
  if (spec.open) {
    // A glazed wood leaf folded back against the jamb leaves a usable doorway.
    box(paint,-.765,.505,recess-.742,.069,.997,1.398);
    box(M.walnut,-.728,.516,recess-.742,.012,.80,1.210);
    for (const z of [-.071,-1.417]) box(paint,-.765,1.871,recess+z,.071,1.81,.093);
    for (const y of [1.017,1.75,2.763]) box(paint,-.765,y,recess-.742,.071,.081,1.387);
    put(M.glass,new THREE.PlaneGeometry(1.271,1.66).rotateY(Math.PI/2).translate(-.759,1.875,recess-.742));
    box(M.brass,-.709,1.071,recess-1.33,.088,.175,.043);
  } else {
    box(paint,0,.50,.056,1.42,1.0,.11);
    panel(M.glass,0,1.88,.074,1.41,1.76);
    box(paint,0,1.67,.131,.076,2.08,.055);
    box(M.brass,.20,1.17,.158,.033,.27,.046);
  }

  for (const x of [-3.1,0,3.1]) {
    put(M.brass, new THREE.CylinderGeometry(.021,.021,.42,8).translate(x,4.085,-1.47));
    const shade = new THREE.SphereGeometry(.129,18,10);
    shade.scale(1,.52,1);
    put(M.lamp,shade.translate(x,3.85,-1.47));
  }
  const service = tailor ? buildWalkerFixture(ctx,shop,put,box,M,furniture,garments)
    : serviceMenu ? buildCounterFixture(spec,shop,put,box,M,furniture) : null;
  if (!service) roomContents(put,box,M);
  const pendant = new THREE.PointLight(0xffdfb4, displayWindows ? 20 : 31, 6.3, 2);
  pendant.position.set(0, 3.65, -1.51);
  shop.add(pendant);
  if (service) {
    const rearLight = new THREE.PointLight(pharmacy ? 0xffe8cb : 0xffdcab, 11, 4.2, 2);
    rearLight.position.set(1.01,2.59,-2.06);
    shop.add(rearLight);
  }
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    for (const geometry of geometries) geometry.dispose();
    mesh.receiveShadow = true;
    shop.add(mesh);
  }
  const sign = ctx.deco.canvasSign(spec.name.toUpperCase(), {
    width:Math.min(width - .62, 8.3), canvasWidth:1536, canvasHeight:113,
    colors:tailor ? ['#26352b','#b79659','#efdeb7'] : service ? pharmacy ? ['#17372f','#bca36c','#eed9a7'] : ['#581f20','#be9267','#f1e0b9'] : undefined,
  });
  sign.position.set(0,3.938,.173);
  shop.add(sign);
  const transomSign = ctx.deco.canvasSign(spec.subtitle, {
    width:Math.min(width - 1.1, 6.9), canvasWidth:1024, canvasHeight:53, chevrons:!tailor,
    colors:tailor ? ['#26352b','#b79659','#efdeb7'] : undefined,
  });
  transomSign.position.set(0,3.40,.174);
  shop.add(transomSign);
  if (service) {
    const menu = ctx.deco.canvasSign((serviceMenu.item+' · '+serviceMenu.price+'¢').toUpperCase(),{
      width:tailor ? 3.22 : pharmacy ? 3.77 : 2.16, canvasWidth:1024, canvasHeight:tailor || pharmacy ? 108 : 238,
      colors:pharmacy ? ['#244537','#c8a767','#efdeb6'] : ['#57272a','#b79058','#f2dfb5'],
    });
    menu.position.set(0,tailor ? 2.85 : pharmacy ? 3.57 : 2.55,-SHOP_DEPTH+.132);
    if (tailor) {
      const notice = ctx.deco.canvasSign('STATION DELIVERIES',{
        width:.80,canvasWidth:420,canvasHeight:80,colors:['#2d352b','#9f8456','#e6d4a3'],
      });
      notice.position.set(4.66,1.39,.162);
      shop.add(notice);
      ctx.registerInteractive(notice,{title:spec.name,body:spec.copy});
    }
    shop.add(menu);
  } else {
    const notice = new THREE.Object3D();
    notice.position.set(0,1.42,spec.open ? -1.88 : .23);
    shop.add(notice);
    ctx.registerInteractive(notice,{title:spec.name,body:spec.copy});
  }

  // A 1.58 m opening remains between the jambs after padding for the player.
  const collision = [
    [-w,-doorHalf,-.13,.21], [doorHalf,w,-.13,.21],
    [-w,-w+.24,-SHOP_DEPTH,.21], [w-.24,w,-SHOP_DEPTH,.21],
    ...(tailor ? [] : [service ? [-1.63,1.63,-2.857,-2.039] : [-1.49,1.49,-3.09,-2.24]]),
    ...furniture,
  ];
  if (!spec.open) collision.push([-doorHalf,doorHalf,-.13,.20]);
  return {shop, collision, service, displays};
}

function orientedBox(x, z, side, [u0,u1,v0,v1]) {
  const a = x + side*v0, b = x + side*v1;
  const c = z - side*u0, d = z - side*u1;
  return {minX:Math.min(a,b),maxX:Math.max(a,b),minZ:Math.min(c,d),maxZ:Math.max(c,d)};
}

function registerWindowDisplay(ctx, shop, spec, displays) {
  const pharmacy = spec.kind==='chemist';
  for (const display of displays) {
    const bulb=display.lightMount.getWorldPosition(new THREE.Vector3());
    ctx.deco.registerLampPosition(bulb.x,bulb.y,bulb.z,{
      color:pharmacy ? 0xffddaa : 0xffcc94,reach:4.8,daytime:6,nighttime:25,
    });
  }

  const mark = new THREE.Object3D();
  mark.position.set(...displays[0].target);
  mark.name = pharmacy ? 'Drugstore fountain card' : 'Crown window menu';
  shop.add(mark);
  const view = new THREE.Vector3();
  const {price} = SHOP_MENUS[spec.kind];
  ctx.registerInteractive(mark,{
    title:mark.name,
    body:pharmacy
      ? 'Lemon phosphate '+price+'¢ at the soda fountain. On the sill sit the house syrup, tooth powder, and a white porcelain mortar.'
      : 'House coffee '+price+'¢ at the counter. Sandwiches 10¢. The pies in the front window are kept under glass.',
    available(position) {
      shop.worldToLocal(view.copy(position));
      return view.z>.27 && view.z<3.0 && Math.abs(view.x-mark.position.x)<1.5 && view.y<2.47;
    },
  });
}

export async function add20thStreetStores(ctx, parent, surfaces) {
  const garments = await loadWalkerWindows();
  const M = makeShopMaterials(surfaces,ctx.environment);
  ctx.streetReflection?.reflect(M.glass);
  ctx.streetReflection?.reflect(M.display.pane);
  const footprintBoxes = [];
  for (const spec of STORES) {
    const landmark = ctx.plan.landmarks.find(building => building.id === spec.landmark);
    const [x,z] = landmark.position;
    const [width,depth] = landmark.footprint;
    const side = x < 0 ? 1 : -1;
    const frontX = x + side * width / 2;
    const frontZ = z + spec.bay * depth / 4;
    const {shop, collision, service, displays} = makeShop(spec,depth/2,ctx,M,garments);
    shop.position.set(frontX,SIDEWALK_HEIGHT,frontZ);
    shop.rotation.y = side * Math.PI/2;
    parent.add(shop);
    if (displays.length) registerWindowDisplay(ctx,shop,spec,displays);
    for (const box of collision) footprintBoxes.push(orientedBox(frontX,frontZ,side,box));
    if (spec.open) {
      const staffZ = service ? STAFF_Z : -SHOP_DEPTH+.28;
      const actor = {
        id:'staff-' + spec.kind, model:spec.model, position:[frontX + side*staffZ,frontZ],
        yawDeg:side*90, scale:0.97, groundY:SIDEWALK_HEIGHT,
      };
      ctx.characters.push(actor);
      if (service) {
        const target = displays[0]?.target ?? service.displayTarget;
        const window = target ? {
          point:shop.localToWorld(new THREE.Vector3(target[0],0,1.36)),
          target:shop.localToWorld(new THREE.Vector3(...target)),
        } : null;
        ctx.shopCounters.push({kind:spec.kind,name:spec.name,shop,actor,service,window});
      }
    }
  }

  // The rest of both towers remains solid. The recess and entries are defined by the authored rooms.
  for (const id of new Set(STORES.map(store => store.landmark))) {
    const landmark = ctx.plan.landmarks.find(building => building.id === id);
    const [x,z] = landmark.position;
    const [width,depth] = landmark.footprint;
    const side = x < 0 ? 1 : -1;
    const frontX = x + side*width/2;
    footprintBoxes.push(orientedBox(frontX,z,side,[-depth/2,depth/2,-width,-SHOP_DEPTH+.12]));
  }
  ctx.controls.addColliders(footprintBoxes);
}
