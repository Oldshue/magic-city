import * as THREE from '../../vendor/three.module.min.js';

export const COUNTER_TOP = 1.058;
export const STAFF_Z = -3.20;

const cupHome = [-.37,COUNTER_TOP,-2.80];
const guestEdge = [-.18,COUNTER_TOP,-2.16];
const pourPosition = [-.333,1.355,-2.60];

function colored(color,roughness=.68) {
  return new THREE.MeshStandardMaterial({color,roughness});
}

function turned(points,segments=24) {
  return new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),segments);
}

function bar(points,radius) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),
    20,radius,8,false);
}

function cup(kind,materials) {
  const group=new THREE.Group();
  const soda=kind==='chemist';
  group.name = soda ? 'Lemon phosphate glass' : 'Crown coffee cup';
  const glass = new THREE.MeshPhysicalMaterial({
    color:0xf3f4e4,transparent:true,opacity:.37,roughness:.17,metalness:0,
    envMap:materials.glass.envMap,envMapIntensity:.63,depthWrite:false,side:THREE.DoubleSide,
  });
  const shell = soda ? [[0,0],[.028,0],[.031,.015],[.026,.026],[.036,.116],[.039,.125],
    [.038,.131],[.035,.13],[.032,.114],[.023,.027],[0,.023]] :
    [[0,0],[.041,0],[.047,.016],[.052,.069],[.051,.078],[.046,.079],[.043,.071],[.039,.027],[0,.023]];
  const vessel = new THREE.Mesh(turned(shell),soda ? glass : materials.linen);
  vessel.castShadow = !soda;
  group.add(vessel);
  if (!soda) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.026,.0058,9,20,Math.PI*1.24),materials.linen);
    handle.position.set(.049,.043,0);
    handle.rotation.z = -1.24*Math.PI/2;
    group.add(handle);
  }
  const filled = new THREE.Mesh(turned(soda ? [[0,.025],[.023,.026],[.033,.114],[0,.114]] :
    [[0,.024],[.036,.024],[.045,.066],[0,.066]]),colored(soda ? 0xc99e47 : 0x452415,.25));
  filled.name = 'Drink fill';
  filled.scale.y=.02;
  group.add(filled);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(.0035,.0045,1,8),
    colored(soda ? 0xc7ad77 : 0x583429,.32));
  stream.name = 'Fountain stream';
  stream.visible=false;
  group.visible=false;
  group.userData.restHeight=COUNTER_TOP;
  return {group,filled,stream};
}

function bottle(put,box,M,x,y,z,style) {
  const contour=style===0
    ? [[0,0],[.042,0],[.048,.018],[.048,.151],[.041,.172],[.023,.192],[.022,.235],[0,.235]]
    : [[0,0],[.055,0],[.056,.014],[.052,.108],[.046,.134],[.034,.15],[.034,.183],[0,.183]];
  const material=[M.amber,M.moss,M.linen][style];
  put(material,turned(contour,style===1 ? 10 : 18).translate(x,y,z));
  const capY=style===0 ? .237 : .185;
  put(style===2 ? M.linen : M.brass,
    new THREE.CylinderGeometry(style===0?.021:.034,style===0?.023:.035,.018,14).translate(x,y+capY,z));
  box(M.paper,x,y+.083,z+.051,.074,.073,.004);
  box(M.wood,x,y+.094,z+.054,.055,.009,.001);
  box(M.wood,x,y+.075,z+.054,.037,.006,.001);
}

function apothecaryShelves(put,box,M) {
  const z=-4.41;
  for (const x of [-2.60,-1.28,0,1.28,2.60]) {
    box(M.walnut,x,.52,z,1.23,.96,.47);
    box(M.wood,x,.54,z+.25,1.04,.77,.038);
    box(M.brass,x,.82,z+.28,.19,.032,.026);
    box(M.walnut,x,2.08,z-.04,1.23,2.1,.095);
    box(M.walnut,x-.59,2.02,z+.14,.095,2.0,.39);
    box(M.walnut,x+.59,2.02,z+.14,.095,2.0,.39);
    for (let shelf=0;shelf<4;shelf++) {
      const y=1.05+.51*shelf;
      box(M.walnut,x,y,z+.13,1.19,.058,.39);
      box(M.brass,x,y+.021,z+.341,1.19,.014,.016);
      for (let i=0;i<5;i++) {
        bottle(put,box,M,x-.43+i*.214,y+.033,z+.14,(i+shelf)%3);
      }
    }
  }
  box(M.walnut,0,3.16,z+.15,6.47,.15,.44);
  box(M.brass,0,3.111,z+.374,6.45,.022,.032);
}

function crownBackWall(put,box,M) {
  const z=-4.42;
  for (const x of [-2.25,2.25]) {
    box(M.walnut,x,.53,z,2.18,1.01,.49);
    box(M.oxblood,x,.49,z+.269,2.06,.77,.027);
    for (const dx of [-.62,0,.62]) box(M.brass,x+dx,.774,z+.291,.20,.026,.033);
    for (const y of [1.34,2.01,2.64]) {
      box(M.walnut,x,y,z+.09,2.15,.063,.355);
      box(M.brass,x,y+.024,z+.263,2.15,.022,.012);
      for (const dx of [-.8,.8]) box(M.walnut,x+dx,y-.117,z+.10,.052,.206,.331);

      for (let i=0;i<6;i++) {
        const cx=x-.80+i*.306;
        if (y<1.5) {
          for (let plate=0;plate<(i%3)+2;plate++) {
            put(M.linen,turned([[0,0],[.077,0],[.099,.013],[.102,.022],[.078,.022],[.064,.015],[0,.015]],20)
              .translate(cx,y+.04+plate*.022,z+.11));
          }
        } else {
          put(y>2.4 ? M.moss : M.linen,turned([
            [0,0],[.036,0],[.042,.018],[.044,.091],[.039,.095],[.036,.026],[0,.025],
          ],20).translate(cx,y+.036,z+.095));
          put(M.linen,new THREE.TorusGeometry(.025,.0053,8,20,Math.PI*1.24)
            .rotateZ(-Math.PI*.62).translate(cx+.042,y+.080,z+.095));
        }
      }
    }
  }
  // The space between racks is a tiled service wall, with a rail for checks.
  box(M.milk,0,1.49,z-.055,2.18,1.13,.04);
  box(M.brass,0,2.04,z-.024,2.25,.035,.041);
  for (let i=0;i<5;i++) {
    const x=-.86+i*.40;
    box(M.paper,x,1.965,z+.013,.14,.135,.006);
    box(M.wood,x,1.982,z+.018,.080,.007,.003);
  }
}

function fountain(put,box,M,pharmacy) {
  const [x,y,z] = pourPosition;
  if (pharmacy) {
    box(M.marble,-.64,1.092,-2.68,.74,.051,.34);
    put(M.brass,turned([[0,0],[.085,0],[.087,.030],[.048,.054],[.028,.109],[.025,.185],[0,.185]])
      .translate(-.55,1.109,-2.67));
    put(M.brass,bar([[-.55,1.28,-2.67],[-.55,1.45,-2.68],[-.46,1.48,-2.67],
      [x,1.458,z],[x,y,z]],.020));
    put(M.wood,bar([[-.548,1.201,-2.657],[-.613,1.25,-2.56]],.026));
  } else {
    const urn = [[0,0],[.145,0],[.146,.040],[.114,.062],[.087,.104],[.115,.14],[.149,.175],
      [.148,.372],[.132,.418],[.091,.449],[.044,.459],[.029,.495],[0,.495]];
    put(M.brass,turned(urn,34).translate(-.53,1.058,-2.68));
    put(M.brass,bar([[-.46,1.38,-2.66],[-.40,1.43,-2.633],[x,y,z]],.024));
    put(M.wood,bar([[-.46,1.39,-2.65],[-.42,1.48,-2.62]],.022));
    for (const side of [-1,1]) put(M.wood,bar([[-.53+side*.139,1.438,-2.68],[-.53+side*.202,1.42,-2.68],
      [-.53+side*.204,1.326,-2.68],[-.53+side*.147,1.308,-2.68]],.023));
  }
}

function rounded(width,height,depth,radius) {
  const geometry=new THREE.BoxGeometry(width,height,depth,8,6,7);
  const vertices=geometry.attributes.position, normals=geometry.attributes.normal;
  const inner=new THREE.Vector3(width*.5-radius,height*.5-radius,depth*.5-radius);
  const point=new THREE.Vector3(), nearest=new THREE.Vector3(), normal=new THREE.Vector3();
  const clamp=THREE.MathUtils.clamp;
  for (let i=0;i<vertices.count;i++) {
    point.fromBufferAttribute(vertices,i);
    nearest.set(clamp(point.x,-inner.x,inner.x),clamp(point.y,-inner.y,inner.y),clamp(point.z,-inner.z,inner.z));
    normal.subVectors(point,nearest).normalize();
    point.copy(nearest).addScaledVector(normal,radius);
    vertices.setXYZ(i,point.x,point.y,point.z);
    normals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  return geometry;
}

function boothLeather(environment) {
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=128;
  const ink=canvas.getContext('2d');
  const field=ink.createImageData(128,128);
  let seed=1929;
  for (let i=0;i<field.data.length;i+=4) {
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    const grain=118+(seed>>>26);
    field.data[i]=field.data[i+1]=field.data[i+2]=grain;
    field.data[i+3]=255;
  }
  ink.putImageData(field,0,0);
  const bump=new THREE.CanvasTexture(canvas);
  bump.wrapS=bump.wrapT=THREE.RepeatWrapping;
  bump.repeat.set(3.8,1.8);
  bump.anisotropy=4;
  return new THREE.MeshPhysicalMaterial({
    color:0x742d26,roughness:.56,clearcoat:.30,clearcoatRoughness:.48,
    bumpMap:bump,bumpScale:.009,envMap:environment,envMapIntensity:.27,
  });
}

function booth(put,box,M,x,collisions,leather) {
  for (const [z,dir] of [[-2.46,1],[-1.06,-1]]) {
    box(M.walnut,x,.267,z,1.51,.51,.39);
    put(M.walnut,rounded(1.52,.11,.445,.032).translate(x,.102,z));
    put(leather,rounded(1.48,.142,.395,.049).translate(x,.519,z));
    put(M.oxblood,bar([
      [x-.715,.528,z+dir*.147],[x-.66,.516,z+dir*.193],[x-.26,.515,z+dir*.198],
      [x+.26,.515,z+dir*.198],[x+.66,.516,z+dir*.193],[x+.715,.528,z+dir*.147],
    ],.009));
    put(M.walnut,rounded(1.51,.775,.135,.035).translate(x,.907,z-dir*.214));
    for(let tuft=0;tuft<6;tuft++){
      const tx=x-.616+tuft*.247;
      put(leather,rounded(.239,.715,.104,.044).translate(tx,.913,z-dir*.140));
      put(M.oxblood,new THREE.SphereGeometry(.013,10,8)
        .scale(1,1,.42).translate(tx,1.05,z-dir*.085));
    }
  }
  const z=-1.76;
  put(M.walnut,rounded(1.26,.082,.48,.026).translate(x,.90,z));
  put(M.brass,rounded(1.229,.013,.475,.006).translate(x,.878,z));
  put(M.brass,turned([[0,0],[.19,0],[.19,.04],[.078,.06],[.03,.81],[0,.81]],20).translate(x,0,z));
  for (const offset of [-.39,.37]) {
    put(M.linen,turned([[0,0],[.092,0],[.12,.019],[.12,.032],[.083,.038],[.068,.018],[0,.018]],20)
      .translate(x+offset,.944,z));
    box(M.paper,x+offset,.956,z-.161,.096,.011,.064);
  }
  collisions.push([x-.78,x+.78,-2.78,-.70]);
  const side=Math.sign(x), towardTable=-side;
  const seatZ=towardTable>0 ? -2.46 : -1.06;
  const place=x-side*.39;
  return {
    display:[x,.97,z], seat:[place,.590,seatZ], yaw:towardTable>0 ? 0 : Math.PI,
    aisle:[x-side*1.12,0,seatZ+towardTable*.34], cup:[place,.966,z],
  };
}

/** Dress each counter and supply the actual object used for its service animation. */
export function buildCounterFixture(spec,shop,put,box,M,collisions) {
  const pharmacy=spec.kind==='chemist';
  box(M.walnut,0,.49,-2.45,3.13,.98,.74);
  box(pharmacy ? M.marble : M.walnut,0,1.007,-2.45,3.25,.102,.807);
  box(M.brass,0,.947,-2.041,3.22,.024,.024);
  box(M.marble,0,.085,-2.105,3.19,.171,.083);
  for (let panel=0;panel<5;panel++) {
    const x=-1.24+panel*.62;
    box(M.wood,x,.527,-2.071,.52,.62,.036);
    box(pharmacy ? M.jade : M.oxblood,x,.541,-2.050,.469,.516,.018);
    box(M.brass,x,.285,-2.036,.472,.017,.011);
    box(M.brass,x,.795,-2.036,.472,.015,.011);
  }
  if (pharmacy) apothecaryShelves(put,box,M);
  else crownBackWall(put,box,M);
  fountain(put,box,M,pharmacy);
  const leather=pharmacy ? null : boothLeather(M.glass.envMap);
  const booths=leather ? [-3.39,3.39].map(x=>booth(put,box,M,x,collisions,leather)) : [];
  const drink=cup(spec.kind,M);
  drink.group.position.set(...cupHome);
  drink.stream.position.set(...pourPosition);
  shop.add(drink.group,drink.stream);
  function patronCup(name) {
    const group=drink.group.clone();
    group.name=name;
    shop.add(group);
    return {
      group, filled:group.getObjectByName('Drink fill'), stream:drink.stream,
      stock:cupHome, edge:[-.55,COUNTER_TOP,-2.155], spout:pourPosition,
    };
  }
  return {...drink,stock:cupHome,edge:guestEdge,spout:pourPosition,displayTarget:booths[0]?.display,
    booths,patronCup};
}
