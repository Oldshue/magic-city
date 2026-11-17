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

function booth(put,box,M,x,collisions) {
  for (const [z,dir] of [[-2.46,1],[-1.06,-1]]) {
    box(M.walnut,x,.267,z,1.51,.51,.39);
    box(M.oxblood,x,.519,z,1.48,.142,.38);
    box(M.oxblood,x,.91,z-dir*.215,1.51,.75,.143);
    for(let tuft=0;tuft<6;tuft++){
      box(M.oxblood,x-.61+tuft*.245,.915,z-dir*.139,.192,.712,.026);
    }
  }
  const z=-1.76;
  box(M.walnut,x,.90,z,1.26,.082,.48);
  put(M.brass,turned([[0,0],[.19,0],[.19,.04],[.078,.06],[.03,.81],[0,.81]],20).translate(x,0,z));
  for (const offset of [-.39,.37]) {
    put(M.linen,turned([[0,0],[.092,0],[.12,.019],[.12,.032],[.083,.038],[.068,.018],[0,.018]],20)
      .translate(x+offset,.944,z));
    box(M.paper,x+offset,.956,z-.161,.096,.011,.064);
  }
  collisions.push([x-.78,x+.78,-2.78,-.70]);
  return [x,.97,z];
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
  let displayTarget;
  if (pharmacy) {
    for (const x of [-3.95,3.85]) {
      box(M.walnut,x,.40,-.64,1.38,.79,.52);
      box(M.marble,x,.822,-.64,1.42,.058,.579);
      for (let i=0;i<5;i++) bottle(put,box,M,x-.47+.22*i,.85,-.60,(i%3));
      collisions.push([x-.70,x+.70,-.94,-.34]);
    }
  } else {
    displayTarget = booth(put,box,M,-3.39,collisions);
    booth(put,box,M,3.39,collisions);
  }
  const drink=cup(spec.kind,M);
  drink.group.position.set(...cupHome);
  drink.stream.position.set(...pourPosition);
  shop.add(drink.group,drink.stream);
  return {...drink,stock:cupHome,edge:guestEdge,spout:pourPosition,displayTarget};
}
