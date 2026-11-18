import { bar, batch, box } from './vehicle-geometry.js';
import { mapShopUV } from './shop-surfaces.js';
import { createEntranceMotion, ENTRANCE_THICKNESS, hitsDoorLeaf } from './shop-entrance-motion.mjs';

export function buildShopEntrance(THREE, shop, paint, materials, jamb, recess, head) {
  const {walnut, brass, glass} = materials;
  const clearHalf = jamb - .073;
  const width = clearHalf * 2 - .025;
  const hingeX = -clearHalf + .011;
  const hingeZ = recess + .091;
  const bottom = recess ? .039 : .106;
  const top = head - .071;
  const thickness = ENTRANCE_THICKNESS;
  const leaf = new THREE.Group();
  leaf.name = 'Hinged entrance door';
  leaf.position.set(hingeX,0,hingeZ);
  shop.add(leaf);

  const center = width*.5, stile = .102, kick = .927;
  const lowerRail = bottom+.12, upperRail = top-.068;
  const join = kick+.071;
  const lightHeight = upperRail-join-.12;
  const lightCenter = join+.057+lightHeight*.5;
  const unpainted = [];
  const frame = [
    box(stile*.5,(bottom+top)*.5,0,stile,top-bottom,thickness),
    box(width-stile*.5,(bottom+top)*.5,0,stile,top-bottom,thickness),
    box(center,lowerRail,0,width-.10,.24,thickness),
    box(center,upperRail,0,width-.10,.136,thickness),
    box(center,join,0,width-.11,.123,thickness),
    box(center,lightCenter+.057,0,width-stile*2,.039,.055),
    box(center,lightCenter,.003,.032,lightHeight,.038),
  ];
  const lowerPanelHeight = join-.057-lowerRail-.131;
  const lowerPanelCenter = lowerRail+.12+lowerPanelHeight*.5;
  unpainted.push(box(center,lowerPanelCenter,0,width-stile*2+.007,lowerPanelHeight,.045));
  for (const side of [-1,1]) {
    const depth = side*.028;
    for (const offset of [-1,1]) {
      unpainted.push(box(center+offset*(center-stile-.042),lowerPanelCenter,depth,.034,lowerPanelHeight-.11,.021));
      unpainted.push(box(center,lowerPanelCenter+offset*(lowerPanelHeight*.5-.054),depth,width-stile*2-.055,.033,.021));
    }
    unpainted.push(box(center,bottom+.19,side*.037,width-stile*2-.031,.083,.011));
  }
  for (const geometry of unpainted) {
    if (walnut.userData.metresPerTile) mapShopUV(geometry,walnut.userData.metresPerTile);
  }
  batch(leaf,frame,paint);
  batch(leaf,unpainted,walnut);
  batch(leaf,[new THREE.PlaneGeometry(width-stile*2+.005,lightHeight+.027).translate(center,lightCenter,0)],glass,false);

  const hardware = [];
  const gripX = width-.100, gripY = 1.184;
  const plate = new THREE.Object3D();
  plate.name = 'Entrance push plate';
  plate.position.set(width*.54,join+.043,.056);
  leaf.add(plate);
  hardware.push(box(plate.position.x,plate.position.y,.041,.236,.087,.013));
  for (const offset of [-.096,.096]) {
    hardware.push(new THREE.SphereGeometry(.007,10,6).scale(1,1,.45)
      .translate(plate.position.x+offset,plate.position.y,.049));
  }
  for (const side of [-1,1]) {
    const z = side*.039;
    hardware.push(box(gripX,gripY,z,.048,.258,.009));
    for (const y of [gripY-.080,gripY+.080]) {
      hardware.push(bar([gripX,y,z],[gripX,y,side*.086],.011,9));
      hardware.push(new THREE.SphereGeometry(.008,10,7).translate(gripX,y,side*.086));
    }
    hardware.push(bar([gripX,gripY-.080,side*.086],[gripX,gripY+.080,side*.086],.0105,11));
  }
  for (const y of [bottom+.28,1.45,top-.25]) {
    hardware.push(box(.023,y,-.035,.056,.117,.013));
    hardware.push(bar([.006,y-.061,-.045],[.006,y+.061,-.045],.013,13));
  }
  batch(leaf,hardware,brass);

  const bell = new THREE.Group();
  bell.name = 'Brass entrance bell';
  bell.position.set(hingeX+.176,top-.018,hingeZ-.109);
  shop.add(bell);
  batch(shop,[bar([bell.position.x,top+.025,hingeZ],[bell.position.x,top+.008,bell.position.z],.010,10)],brass);
  const outline = [[.043,-.103],[.046,-.097],[.037,-.083],[.030,-.052],[.021,-.038],[.012,-.030],[.006,-.025]]
    .map(([x,y])=>new THREE.Vector2(x,y));
  const shade = new THREE.LatheGeometry(outline,22);
  batch(bell,[shade,bar([0,-.006,0],[0,-.098,0],.0045,9),
    new THREE.SphereGeometry(.009,12,8).translate(0,-.106,0)],brass);

  const motion = createEntranceMotion();
  return {
    shop, leaf, bell, plate, width, hingeX, hingeZ, motion, guests:[], requested:false,
    blocks(x,z,radius) {
      return hitsDoorLeaf(x-hingeX,z-hingeZ,radius,width,motion.angle);
    },
  };
}
