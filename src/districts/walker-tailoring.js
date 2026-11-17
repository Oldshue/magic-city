import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { POCKET_SQUARES } from '../gameplay/shop-state.mjs';

export async function loadWalkerWindows() {
  try {
    const {scene} = await new GLTFLoader().loadAsync('./data/art/walker-window-suits.glb');
    return scene;
  } catch (error) {
    console.warn('[magic-city] Walker window forms are unavailable:', error.message);
    return null;
  }
}

const STOCK = Object.freeze([0, 1.042, -2.775]);
const EDGE = Object.freeze([0, 1.042, -2.31]);
const HALF_SILK = 0.18;
const GRID = 18;

function weave() {
  const size = 96;
  const texels = new Uint8Array(size ** 2 * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const thread = 128 + 23 * Math.cos(Math.PI * .5 * x) + 18 * Math.sin(Math.PI * .5 * y)
        + 8 * Math.cos(Math.PI * .5 * (x - y));
      texels.set([thread, thread, thread, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(texels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function silkMaterials(environment, relief) {
  return Object.fromEntries(Object.entries(POCKET_SQUARES).map(([key, variant]) => [
    key,
    new THREE.MeshPhysicalMaterial({
      name:variant.name, color:new THREE.Color(variant.color).multiplyScalar(.72), roughness:.56,
      sheen:.82, sheenRoughness:.52, sheenColor:variant.color, emissive:variant.color, emissiveIntensity:.055,
      side:THREE.DoubleSide, vertexColors:true, bumpMap:relief, bumpScale:.0024,
      envMap:environment, envMapIntensity:.53, specularIntensity:.42,
    }),
  ]));
}

/** A fixed crease and a loose, hand-guided half of the cloth. */
function square(material) {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const grid = [], positions = [], colors = [], uv = [], triangles = [];
  for (let row = 0; row <= GRID; row++) {
    for (let column = 0; column <= GRID; column++) {
      const u = column / GRID, v = row / GRID;
      grid.push([(u * 2 - 1) * HALF_SILK, (v * 2 - 1) * .162]);
      positions.push(0, 0, 0);
      uv.push(u * 3, v * 3);
      const hem = Math.min(row, column, GRID - row, GRID - column) === 0;
      colors.push(hem ? .65 : 1, hem ? .51 : 1, hem ? .44 : .98);
      if (row && column) {
        const d = row * (GRID + 1) + column, a = d - GRID - 2;
        triangles.push(a, d, a + 1, a, d - 1, d);
      }
    }
  }
  const points = new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', points);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .085, 0), .34);
  const fabric = new THREE.Mesh(geometry, material);
  fabric.castShadow = fabric.receiveShadow = true;
  group.add(fabric);
  const grip = new THREE.Object3D();
  grip.name = 'Silk edge grip';
  group.add(grip);
  const adjustment = new THREE.Vector3();
  let cosine = 1, sine = 0;

  function shape() {
    for (let i = 0; i < grid.length; i++) {
      const [x,z] = grid[i];
      const loose = x < 0 ? -x / HALF_SILK : 0;
      const lift = loose * HALF_SILK * sine;
      const drape = Math.sin((z+.162) * 31) * .009 * sine * loose * (1-loose);
      const curl = .003 * Math.sin((z+.162)*17 + (x+.18)*23);
      const pull = loose**2 * (1 - .63 * Math.abs(z)/.162);
      points.setXYZ(i, (x < 0 ? x * cosine : x) + adjustment.x * pull,
        .004 + lift + loose * (1-cosine)*.005 + drape + curl + adjustment.y * pull,
        z + adjustment.z * pull);
    }
    points.needsUpdate = true;
    geometry.computeVertexNormals();
    const center = (GRID / 2) * (GRID + 1);
    grip.position.fromBufferAttribute(points, center);
  }

  return {
    group, fabric,
    setFold(fold) {
      const angle = Math.PI * fold;
      cosine = Math.cos(angle);
      sine = Math.sin(angle);
      adjustment.set(0, 0, 0);
      shape();
    },
    followHand(world) {
      group.worldToLocal(world);
      adjustment.subVectors(world, grip.position).clampLength(0, .09);
      shape();
    },
  };
}

function stitchedBolt(put, material, x, y, z, length, radius, drop = false) {
  put(material, new THREE.CylinderGeometry(radius*.985, radius, length, 28, 5)
    .rotateX(Math.PI/2).translate(x,y,z));
  const end = z + length / 2;
  for (let i=1; i<=4; i++) {
    put(material, new THREE.TorusGeometry(radius*(.31+i*.146),.0034,5,32)
      .translate(x,y,end+.012));
  }
  if (!drop) return;
  const positions = [], uv = [], triangles = [];
  const columns = 12, rows = 10;
  for (let row=0;row<=rows;row++) {
    const v=row/rows;
    for (let col=0;col<=columns;col++) {
      const u=col/columns;
      const billow = Math.cos(u*Math.PI*6)*.026*v;
      positions.push(x-.069-v*.15 + u*.25, y+radius-v*.251 + billow,
        end+.014+v*.12 + Math.sin(u*7.1)*.024*v);
      uv.push(u, v);
      if (row && col) {
        const d=row*(columns+1)+col,a=d-columns-2;
        triangles.push(a,a+1,d,a,d,d-1);
      }
    }
  }
  const fabric = new THREE.BufferGeometry();
  fabric.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  fabric.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  fabric.setIndex(triangles);
  fabric.computeVertexNormals();
  put(material,fabric);
}

function shear(put, M, steel) {
  for (const [cx, angle] of [[.62,.57],[.697,-.58]]) {
    const loop = new THREE.TorusGeometry(.041,.013,8,22).scale(1,.75,1).rotateX(Math.PI/2);
    put(M.brass,loop.translate(cx,1.066,-2.74));
    const shank = new THREE.BoxGeometry(.022,.012,.092).rotateY(angle);
    put(M.brass,shank.translate(cx+.019,1.064,-2.792));
  }
  for (const [x, turn] of [[.665,.32],[.68,-.28]]) {
    const blade = new THREE.Shape();
    blade.moveTo(-.014,0);blade.lineTo(.019,0);blade.lineTo(.013,.158);blade.lineTo(-.002,.184);blade.closePath();
    put(steel,new THREE.ShapeGeometry(blade).rotateX(-Math.PI/2).rotateY(turn)
      .translate(x,1.069,-2.819));
  }
  put(M.brass,new THREE.CylinderGeometry(.014,.014,.017,14).translate(.666,1.069,-2.811));
}

export function buildWalkerFixture(ctx, shop, put, box, M, furniture, garments) {
  const relief = weave();
  const silk = silkMaterials(ctx.environment, relief);
  const tweeds = [0x44546c,0x846c53,0x6e573d,0x78817b,0xbba585,0x334540].map(color=>
    new THREE.MeshStandardMaterial({color, roughness:.96, bumpMap:relief, bumpScale:.008,
      side:THREE.DoubleSide, emissive:color, emissiveIntensity:.059}));
  const ebonized = new THREE.MeshStandardMaterial({color:0x223631, roughness:.64});
  const felt = new THREE.MeshStandardMaterial({color:0x424144, roughness:.95, bumpMap:relief, bumpScale:.004});
  box(M.walnut,0,.50,-2.62,3.20,1.00,.79);
  box(M.walnut,0,1.001,-2.62,3.33,.082,.86);
  box(felt,0,1.043,-2.665,1.41,.008,.604);
  box(ebonized,0,.46,-2.204,3.0,.66,.058);
  for (const x of [-1.17,-.39,.39,1.17]) {
    box(M.walnut,x,.45,-2.164,.69,.528,.045);
    box(M.brass,x,.512,-2.134,.132,.027,.023);
  }
  box(M.brass,0,.908,-2.181,3.18,.02,.034);
  box(M.wood,0,.092,-2.175,3.20,.084,.088);
  furniture.push([-1.67,1.67,-3.055,-2.17]);
  // Folded tissue, chalk, steel shears, and tape on the cutter’s table.
  for (let i=0;i<4;i++) box(M.paper,-1.14,1.052+i*.008,-2.686+i*.008,.312,.006,.248);
  box(M.linen,-.732,1.062,-2.556,.042,.021,.054);
  const steel = new THREE.MeshStandardMaterial({color:0x9d9c99,metalness:.86,roughness:.28,envMap:ctx.environment});
  shear(put,M,steel);
  const pattern = new THREE.PlaneGeometry(.46,.39).rotateX(-Math.PI/2).rotateY(.25).translate(1.02,1.045,-2.68);
  put(M.paper,pattern);
  for (let i=0;i<19;i++) {
    const y = 1.048 + .008 * Math.sin(i*.46);
    const x = .96 + .13*Math.cos(i*.092);
    box(M.linen,x,y,-2.847+i*.015,.040,.003,.021);
    box(M.wood,x-.017,y+.002,-2.847+i*.015,i%5===0 ? .019 : .010,.001,.003);
  }

  let displayTarget;
  for (const side of [-1,1]) {
    const x = side*3.71;
    box(M.walnut,x,1.56,-4.53,3.92,3.03,.19);
    for (const dx of [-1.91,-.65,.65,1.91]) box(M.walnut,x+dx,1.62,-4.319,.063,2.77,.50);
    for (let shelf=0;shelf<4;shelf++) {
      const y=.49+shelf*.61;
      box(M.walnut,x,y,-4.25,3.92,.054,.61);
      box(M.brass,x,y+.020,-3.94,3.93,.015,.019);
      for (let bolt=0;bolt<13;bolt++) {
        const r=.104 + .012 * ((shelf*3 + bolt)%4);
        const cloth=tweeds[(bolt + shelf*3 + (side>0?1:0))%tweeds.length];
        stitchedBolt(put,cloth,x-1.76+bolt*.287,y+.031+r,-4.27,.52,r,bolt%4===0);
      }
    }
    furniture.push([x-1.97,x+1.97,-4.64,-3.86]);

    const displayStand = side*4.81;
    box(M.walnut,displayStand,.25,-1.12,.83,.50,.88);
    box(ebonized,displayStand,.502,-1.12,.88,.04,.91);
    for (let sample=0; sample<3; sample++) {
      const cloth = tweeds[(sample + (side>0 ? 3 : 0))%tweeds.length];
      stitchedBolt(put,cloth,displayStand+(sample-1)*.237,.625,-1.10,.61,.103,sample===1);
    }
    furniture.push([displayStand-.45,displayStand+.45,-1.59,-.662]);

    const window = side*2.72;
    box(M.walnut,window,.295,-.96,2.42,.584,1.40);
    box(ebonized,window,.588,-.96,2.47,.051,1.45);
    box(M.brass,window,.365,-.247,2.37,.024,.018);
    box(M.walnut,window,1.62,-1.669,2.45,2.10,.07);
    for (let stripe=0;stripe<3;stripe++) {
      box(felt,window-.79+stripe*.79,1.68,-1.612,.743,1.99,.039);
    }
    const formX = window-side*.13, formZ = -1.097;
    if (side>0) displayTarget = [formX,1.82,formZ];
    const style = side<0 ? 'Navy serge' : 'Tobacco herringbone';
    const form = garments?.getObjectByName(style.replaceAll(' ', '_')) ?? garments?.getObjectByName(style);
    if (form) {
      form.name = style;
      form.position.set(formX,.629,formZ);
      form.rotation.y = -side*.14;
      form.scale.setScalar(.96);
      shop.add(form);
    }
    const ticket = ctx.deco.canvasSign(style.toUpperCase(),{
      width:1.14,canvasWidth:670,canvasHeight:105,colors:['#202d29','#95744b','#eedab2'],
    });
    ticket.position.set(window+side*.035,.729,-.291);
    ticket.rotation.x=-.17;
    shop.add(ticket);
    const id = side<0?'oxblood':'champagne';
    const display = square(silk[id]);
    display.setFold(.79);
    display.group.position.set(window+side*.767,.666,-.585);
    display.group.rotation.set(.09,side*.30,-side*.11);
    display.group.scale.setScalar(.76);
    display.group.name = 'Displayed ' + POCKET_SQUARES[id].name.toLowerCase();
    shop.add(display.group);
    box(M.paper,window+side*.711,.643,-.583,.339,.093,.29);
    furniture.push([window-1.26,window+1.26,-1.74,-.216]);

    const taskLight = new THREE.SpotLight(0xffe2b5, 42, 5.6, .66, .74, 1.6);
    taskLight.position.set(window-.24,3.23,-.115);
    taskLight.target.position.set(window,1.33,-1.01);
    shop.add(taskLight,taskLight.target);
  }
  const workLight = new THREE.PointLight(0xffdfb0,15,4.9,2);
  workLight.position.set(.37,2.75,-2.06);
  shop.add(workLight);
  const folded = square(silk.oxblood);
  folded.group.name = 'Walker silk on the cutting table';
  folded.group.visible = false;
  shop.add(folded.group);
  return {
    ...folded, stock:STOCK, edge:EDGE, displayTarget,
    select(id) { folded.fabric.material = silk[id]; },
  };
}
