import * as THREE from '../../vendor/three.module.min.js';
import { registerNightEmission } from '../engine/materials.js';
import { SHOP_MENUS } from '../gameplay/shop-state.mjs';

const PANE_Z = -.155;
const SHELF_FRONT = -.286;
const INK = {
  chemist: {dark:'#254537', fine:'#9b794f', paper:'#e7d7ae'},
  lunch: {dark:'#5e2521', fine:'#b18554', paper:'#f0dbb1'},
};

function turned(points, segments=24) {
  return new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),segments);
}

function printedCard({heading, sub, dark, fine, paper}) {
  const canvas = document.createElement('canvas');
  canvas.width=768;
  canvas.height=348;
  const draw=canvas.getContext('2d');
  draw.fillStyle=paper;
  draw.fillRect(0,0,768,348);
  draw.fillStyle='#78562a12';
  for (let i=0;i<620;i++) {
    draw.fillRect((i*197+i*i*13)%760,(i*233+i*i*7)%343,1+(i%5),1+(i%3));
  }
  draw.strokeStyle=dark;
  draw.lineWidth=7;
  draw.strokeRect(15,15,738,318);
  draw.strokeStyle=fine;
  draw.lineWidth=2.5;
  draw.strokeRect(29,29,710,290);
  draw.fillStyle=dark;
  draw.textAlign='center';
  draw.textBaseline='middle';
  draw.font='bold 66px Georgia';
  draw.fillText(heading,384,121,656);
  draw.fillStyle=fine;
  draw.fillRect(187,181,394,3);
  draw.fillStyle=dark;
  draw.font='bold 45px Georgia';
  draw.fillText(sub,384,241,653);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=6;
  return new THREE.MeshStandardMaterial({map:texture,roughness:.86,emissive:0xffffff,
    emissiveMap:texture,emissiveIntensity:.095});
}

export function makeDisplayMaterials(environment) {
  const glass=(color,opacity,roughness)=>new THREE.MeshPhysicalMaterial({
    color, opacity, roughness, transparent:true, depthWrite:false, side:THREE.DoubleSide,
    forceSinglePass:true, metalness:.02, clearcoat:.52, envMap:environment, envMapIntensity:.57,
  });
  const highlight=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({
    color,roughness,metalness,envMap:environment,envMapIntensity:.34,
  });
  const pane=glass(0xd9e7de,.16,.21);
  pane.name='Recessed storefront glazing';
  return {
    pane,
    cover:glass(0xdde6d9,.17,.165),
    chemistPlaster:highlight(0xb4a687,.91),
    crownPlaster:highlight(0xab9274,.91),
    amber:glass(0xab5b24,.87,.21),
    cobalt:glass(0x285579,.91,.18),
    syrup:highlight(0x62341b,.30),
    jar:highlight(0xe0d6ba,.28),
    crust:highlight(0xae7139,.71),
    pastry:highlight(0xde9d55,.59),
    filling:highlight(0x714525,.82),
    shades:highlight(0x493832,.48,.25),
    opal:registerNightEmission(new THREE.MeshStandardMaterial({
      color:0xffe1b4,emissive:0xffd49b,roughness:.60,
    }),.24,1.66),
    chemistCard:printedCard({...INK.chemist,heading:'LEMON PHOSPHATE',sub:'AT THE FOUNTAIN   '+SHOP_MENUS.chemist.price+'¢'}),
    chemistGoods:printedCard({...INK.chemist,heading:'THE DRUGGIST’S SHELF',sub:'SOAP   ·   TOOTH POWDER   ·   STATIONERY'}),
    chemistLabel:printedCard({...INK.chemist,heading:'HOUSE SYRUP',sub:'HEAVIEST CORNER'}),
    crownCard:printedCard({...INK.lunch,heading:'CROWN HOUSE COFFEE',sub:'FRESH AT THE COUNTER   '+SHOP_MENUS.lunch.price+'¢'}),
    crownGoods:printedCard({...INK.lunch,heading:'LUNCH AT THE CROWN',sub:'SANDWICHES   10¢'}),
    crownLabel:printedCard({...INK.lunch,heading:'CROWN',sub:'HOUSE COFFEE'}),
  };
}

function card(put, box, M, material, x,y,z,w,h) {
  box(M.walnut,x,y,z-.017,w+.062,h+.062,.046);
  box(M.brass,x,y-h*.5-.021,z+.011,w+.064,.009,.016);
  put(material,new THREE.PlaneGeometry(w,h).translate(x,y,z+.007));
}

function bottle(put,box,M,D,x,y,z,height,style) {
  const radius=[.055,.059,.063][style];
  const peak=height*.94;
  const shape = [[0,.005],[radius*.84,.005],[radius,.019],[radius,.66*height],
    [radius*.89,.74*height],[radius*.49,.82*height],[radius*.48,peak],[radius*.56,peak],[radius*.56,height]];
  const shell = [D.amber,D.cobalt,D.jar][style];
  put(shell,turned(shape,style===1 ? 16 : 24).translate(x,y,z));
  put(style===0 ? D.syrup : M.paper,turned([[0,.01],[radius*.82,.012],
    [radius*.84,height*.51],[0,height*.51]],20).translate(x,y,z));
  put(style===2 ? M.linen : M.brass,new THREE.CylinderGeometry(radius*.52,radius*.52,.028,16).translate(x,y+height+.008,z));
  put(D.chemistLabel,new THREE.PlaneGeometry(radius*1.47,height*.28).translate(x,y+height*.44,z+radius+.002));
}

function pharmacyDisplay(put,box,M,D,mid,width,side) {
  const rearY=1.186;
  box(M.walnut,mid,1.049,-.908,width*.92,.26,.353);
  box(M.marble,mid,rearY-.018,-.886,width*.94,.045,.432);
  box(M.brass,mid,1.169,-.65,width*.93,.015,.020);
  const start=mid-width*.395;
  for (let i=0;i<8;i++) {
    const px=start+i*(width*.79/7);
    if (i===3||i===4) continue;
    bottle(put,box,M,D,px,rearY+.004,-.825,.238+(.031*(i%4)),i%3);
  }
  for (const i of [0,1,2]) {
    const x=mid-width*.395+i*.29;
    const heights=[.22,.26,.176];
    box(i===1 ? M.moss : M.linen,x,.912+heights[i]/2,-.466,.167,heights[i],.121);
    put(D.chemistLabel,new THREE.PlaneGeometry(.135,.080).translate(x,.965+heights[i]*.43,-.402));
  }
  const mortarX=mid+width*.355;
  put(D.jar,turned([[0,0],[.075,0],[.079,.024],[.106,.033],[.145,.095],[.151,.139],
    [.139,.141],[.130,.116],[.093,.061],[.065,.043],[0,.042]],35).translate(mortarX,.913,-.461));
  put(D.jar,new THREE.CapsuleGeometry(.030,.208,6,14).rotateZ(.72).translate(mortarX+.059,1.061,-.465));
  bottle(put,box,M,D,mid-width*.03,.911,-.488,.315,0);
  bottle(put,box,M,D,mid+width*.065,.911,-.466,.192,1);
  const x = mid;
  card(put,box,M,side<0 ? D.chemistCard : D.chemistGoods,x,1.409,-.653,1.43,.64);
  return [x,1.409,-.622];
}

function pieStand(put,M,D,x,y,z,high) {
  const lift=high ? .181 : .098;
  put(M.linen,turned([[0,0],[.163,0],[.164,.025],[.127,.036],[.065,.040],
    [.051,lift-.03],[.246,lift-.017],[.255,lift+.013],[.233,lift+.023],[0,lift+.025]],36).translate(x,y,z));
  const top=y+lift+.024;
  put(D.crust,turned([[0,0],[.171,0],[.18,.028],[.222,.085],[.219,.101],
    [.209,.104],[.190,.087],[0,.087]],44).translate(x,top,z));
  put(D.filling,turned([[0,0],[.199,0],[.201,.018],[0,.020]],40).translate(x,top+.080,z));
  for (let i=-3;i<=3;i++) {
    const shift=i*.052;
    const length=2*Math.sqrt(.196**2-shift**2);
    for (const yaw of [0,Math.PI/2]) {
      put(D.pastry,new THREE.BoxGeometry(length,.015,.021).translate(0,0,shift)
        .rotateY(yaw).translate(x,top+.105+(yaw ? .007 : 0),z));
    }
  }
  const rim=new THREE.TorusGeometry(.209,.016,8,56).rotateX(Math.PI/2);
  put(D.pastry,rim.translate(x,top+.101,z));

  const cap=y+lift;
  const dome=[[.249,0],[.249,.041],[.242,.104],[.224,.188],[.182,.249],[.112,.287],[.035,.303],[0,.305]];
  put(D.cover,turned(dome,36).translate(x,cap,z));
  put(M.brass,new THREE.TorusGeometry(.023,.006,8,18).translate(x,cap+.322,z));
}

function crownDisplay(put,box,M,D,mid,width,side) {
  pieStand(put,M,D,mid-width*.368,.912,-.540,true);
  pieStand(put,M,D,mid-width*.195,.912,-.527,false);
  for (const i of [0,1,2]) {
    const x=mid+width*(.07+i*.108);
    put(M.linen,turned([[0,0],[.094,0],[.108,.019],[.110,.027],[.082,.029],[0,.021]],24)
      .translate(x,.914,-.474));
    put(M.linen,turned([[0,0],[.058,0],[.065,.018],[.074,.104],[.070,.111],
      [.063,.107],[.051,.020],[0,.016]],24).translate(x,.938,-.474));
    put(M.linen,new THREE.TorusGeometry(.033,.0068,9,24,Math.PI*1.30)
      .rotateZ(-Math.PI*.65).translate(x+.067,.989,-.474));
  }
  const x = mid+width*.24;
  card(put,box,M,side<0 ? D.crownCard : D.crownGoods,x,1.297,-.675,1.46,.648);
  const tinX=mid+width*.426;
  put(M.oxblood,new THREE.CylinderGeometry(.118,.117,.248,24).translate(tinX,1.036,-.632));
  put(M.brass,new THREE.CylinderGeometry(.122,.123,.027,24).translate(tinX,1.169,-.632));
  put(D.crownLabel,new THREE.PlaneGeometry(.188,.110).translate(tinX,1.054,-.516));
  return [x,1.297,-.640];
}

function frameWindow(put,box,M,D,paint,mid,width,sill,head,pharmacy) {
  const casingDepth=.38;
  const sashZ=PANE_Z+.025;
  const height=head-sill;
  // The glass has an outer reveal, its own sash, and real space behind it.
  box(M.wood,mid,sill*.49,-.043,width,sill-.035,.45);
  const sections=pharmacy ? 3 : 2;
  for (let i=0;i<sections;i++) {
    const x=mid-width*.5+width*(i+.5)/sections;
    box(paint,x,.275,.193,width/sections-.108,.345,.045);
    box(M.brass,x,.451,.218,width/sections-.176,.013,.012);
    box(M.walnut,x,.099,.220,width/sections-.163,.030,.019);
  }
  box(pharmacy ? M.marble : M.walnut,mid,sill,.028,width+.042,.084,casingDepth+.094);
  box(M.brass,mid,sill+.040,.266,width+.035,.018,.021);
  const divider=pharmacy ? 3 : 2;
  for (let i=0;i<=divider;i++) {
    const edge=i===0||i===divider;
    const x=mid-width*.5+width*i/divider;
    if (edge) box(paint,x,(sill+head)*.5,-.018,.126,height+.050,casingDepth);
    box(paint,x,(sill+head)*.5,sashZ,.056,height-.054,.072);
    box(M.brass,x,(sill+head)*.5,sashZ+.038,.013,height-.046,.015);
  }
  box(paint,mid,head,.003,width,.085,.405);
  box(M.brass,mid,head-.031,.205,width,.019,.019);
  box(paint,mid,3.441,.020,width,.047,.179);
  for (let i=0;i<=9;i++) {
    box(paint,mid+width*(i/9-.5),3.176,sashZ,.037,.57,.054);
  }
  put(D.pane,new THREE.PlaneGeometry(width-.054,height-.092).translate(mid,(sill+head)*.5,PANE_Z));
  put(D.pane,new THREE.PlaneGeometry(width-.037,.515).translate(mid,3.173,PANE_Z+.058));
}

export function buildStorefrontDisplay({kind, shop, put, box, materials:M, paint, mid, width, sill, head, side}) {
  const D=M.display;
  const pharmacy=kind==='chemist';
  frameWindow(put,box,M,D,paint,mid,width,sill,head,pharmacy);
  const span=width-.53;
  const back=pharmacy ? -1.077 : -.747;
  const depth=SHELF_FRONT-back;
  const z=SHELF_FRONT-depth/2;
  box(M.walnut,mid,.734,z,span,.316,depth);
  box(pharmacy ? M.jade : M.oxblood,mid,.723,SHELF_FRONT+.006,span-.087,.226,.028);
  box(M.brass,mid,.851,SHELF_FRONT+.026,span-.096,.012,.020);
  box(pharmacy ? M.marble : M.walnut,mid,.884,z,span+.036,.057,depth+.065);
  box(M.brass,mid,.892,SHELF_FRONT+.039,span+.005,.019,.017);

  // The shades and lamps sit behind the glass and above the merchandise.
  for (const x of [mid-span*.29,mid+span*.29]) {
    put(D.shades,turned([[0,0],[.133,0],[.132,.038],[.067,.108],[0,.108]],24).translate(x,2.497,-.40));
    put(D.opal,turned([[0,0],[.079,.005],[.085,.040],[.054,.090],[0,.095]],21).translate(x,2.441,-.40));
    box(M.brass,x,2.678,-.41,.023,.177,.024);
  }
  if (!pharmacy) {
    const valance=new THREE.PlaneGeometry(width-.116,.274,48,4);
    const coords=valance.attributes.position;
    for (let i=0;i<coords.count;i++) {
      const [x,y]=[coords.getX(i),coords.getY(i)];
      const ripple=Math.cos((x+width*.5)*15);
      coords.setXYZ(i,x,y-(1-(y+.137)/.274)*(.040+.032*ripple),.032*ripple);
    }
    valance.computeVertexNormals();
    put(M.oxblood,valance.translate(mid,2.620,-.259));
    box(M.brass,mid,2.77,-.259,width-.105,.021,.033);
  }
  const target=pharmacy ? pharmacyDisplay(put,box,M,D,mid,span,side)
    : crownDisplay(put,box,M,D,mid,span,side);
  const lightMount = new THREE.Object3D();
  lightMount.name=pharmacy ? 'Drugstore display light' : 'Crown display light';
  lightMount.position.set(mid,2.39,-.442);
  shop.add(lightMount);
  return {
    lightMount,
    target,
    collision:[mid-span*.5,mid+span*.5,back,SHELF_FRONT],
  };
}
