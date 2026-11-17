import * as THREE from '../../vendor/three.module.min.js';
import { SIDEWALK_HEIGHT } from '../engine/street-layout.js';

const HALF = 5.78;
const DEPTH = 7.52;
const CEILING = 6.9;

export function addBrownMarxLobby(ctx, face, B, M, doorway) {
  const {marble, walnut, brass, glazing} = M;
  const sill = SIDEWALK_HEIGHT;
  const halfDoor = doorway.width/2;
  const floorY = sill-.051;
  B.box(marble,0,floorY,-DEPTH/2,HALF*2,.10,DEPTH,'Marble lobby floor',false);
  for (const x of [-5.20,5.20]) {
    B.box(M.granite,x,sill+.001,-DEPTH/2,.13,.011,DEPTH-.35,'Black marble border',false);
  }
  for (const z of [-.26,-DEPTH+.20]) {
    B.box(M.granite,0,sill+.001,z,10.50,.011,.13,'Black marble border',false);
  }
  for (const x of [-HALF+.04,HALF-.04]) {
    B.box(M.lobbyPlaster,x,CEILING/2,-DEPTH/2,.18,CEILING,DEPTH,'Lobby side walls');
    B.box(marble,x*.975,1.20,-DEPTH/2,.16,2.38,DEPTH,'Marble dados',false);
    B.box(M.bone,x*.966,2.41,-DEPTH/2,.19,.11,DEPTH,'Marble wall caps',false);
    for (const z of [-2.45,-5.78]) {
      B.box(M.lobbyPlaster,x*.956,4.57,z,.20,4.42,.72,'Two-storey marble pilasters',false);
      B.box(marble,x*.943,6.35,z,.28,.29,1.06,'Marble pilaster capitals',false);
    }
  }
  B.box(M.lobbyPlaster,0,CEILING+.08,-DEPTH/2,HALF*2,.16,DEPTH,'Coffered lobby ceiling',false);
  for (const z of [-1.7,-3.6,-5.4,-7.12]) {
    B.box(M.bone,0,CEILING-.04,z,HALF*2,.20,.23,'Ceiling coffers',false);
  }
  B.box(M.lobbyPlaster,0,CEILING*.5,-DEPTH+.08,HALF*2,CEILING,.16,'Interior wall');
  B.box(marble,0,1.33,-DEPTH+.178,HALF*2,2.66,.095,'Marble elevator wall',false);
  B.box(M.bone,0,2.74,-DEPTH+.247,HALF*2,.13,.17,'Elevator wall cap',false);

  for (const x of [-1.70,1.70]) {
    const z = -DEPTH+.257;
    const h = 2.50;
    B.box(M.sash,x,1.39,z,1.72,h,.115,'Elevator gates',false);
    for (const edge of [-.83,.83]) B.box(brass,x+edge,1.39,z+.067,.078,h,.10,'Elevator stiles',false);
    for (const y of [.34,1.22,2.52]) B.box(brass,x,y,z+.078,1.66,.060,.079,'Elevator rails',false);
    for (let i=0;i<10;i++) {
      B.box(brass,x+(i-4.5)*.156,1.87,z+.076,.023,1.26,.032,'Brass grille',false);
    }
    B.box(brass,x,2.81,z+.10,.61,.22,.093,'Elevator indicator',false);
    B.box(M.shade,x,2.81,z+.153,.255,.104,.022,'Opal indicator',false);
  }

  // The open leaves sit inside the vestibule, outside the walkable opening.
  for (const side of [-1,1]) {
    const x = side*(halfDoor-.075);
    B.box(M.sash,x,sill+.59,-.73,.095,.89,1.35,'Open entrance leaves',false);
    for (const z of [-.095,-1.37]) B.box(M.sash,x,sill+1.95,z,.11,3.61,.10,'Open entrance stiles',false);
    for (const y of [1.01,2.35,3.73]) B.box(M.sash,x,sill+y,-.73,.09,.072,1.39,'Open entrance rails',false);
    const pane = new THREE.PlaneGeometry(1.23,2.54).rotateY(-side*Math.PI/2)
      .translate(x-side*.03,sill+2.36,-.73);
    B.put(glazing,pane,'Vestibule glazing',false);
    B.box(brass,x-side*.063,sill+1.21,-1.25,.11,.28,.045,'Door pulls',false);
  }
  B.box(marble,0,sill+.006,-.057,doorway.width,.042,.67,'Marble threshold',false);
  B.box(brass,0,sill+.035,.18,doorway.width-.21,.018,.073,'Brass threshold',false);
  B.box(M.sash,0,3.95,-.21,doorway.width,.12,.11,'Entry transom bar',false);

  // Hall fixtures and furniture stay outside the direct route to the elevators.
  for (const z of [-2.4,-5.5]) {
    const stem = new THREE.CylinderGeometry(.038,.045,1.61,10).translate(0,6.09,z);
    const globe = new THREE.SphereGeometry(.41,20,12).scale(1,.72,1).translate(0,5.27,z);
    B.put(brass,stem,'Lobby pendant stems',false);
    B.put(M.shade,globe,'Lobby pendant glass',false);
  }
  for (const x of [-5.02,-3.73]) {
    const z = -3.48;
    B.box(walnut,x,.47,z,.59,.14,1.62,'Lobby bench',false);
    B.box(walnut,x-.22,.75,z,.10,.53,1.62,'Lobby bench backs',false);
    for (const end of [-.62,.62]) {
      B.box(M.sash,x,.28,z+end,.53,.34,.11,'Bench legs',false);
    }
  }
  B.box(walnut,3.65,.63,-4.98,2.34,.94,.85,'Directory desk',false);
  B.box(walnut,3.65,1.14,-4.98,2.48,.13,.99,'Directory desk top',false);
  for (const x of [2.55,4.74]) {
    B.box(brass,x,.63,-4.54,.042,.86,.026,'Desk moulding',false);
  }
  B.box(M.linen,3.31,1.229,-4.85,.47,.051,.32,'Tenant ledger',false);
  const globe = new THREE.SphereGeometry(.148,16,8).scale(1,.58,1).translate(4.41,1.58,-5.04);
  B.put(M.shade,globe,'Reading lamp',false);
  B.box(brass,4.41,1.37,-5.04,.046,.39,.046,'Reading lamp stem',false);

  const sign = ctx.deco.canvasSign('DIRECTORY', {
    width:1.38, canvasWidth:512, canvasHeight:74, colors:['#322e27','#a38c63','#f0d5a2'],
  });
  sign.position.set(3.65,.92,-4.529);
  face.add(sign);

  const pendant = face.localToWorld(new THREE.Vector3(1.37,4.3,-4.3));
  ctx.deco.registerLampPosition(pendant.x,pendant.y,pendant.z,{
    color:0xffe4b7, reach:9.8, daytime:57, nighttime:67,
  });

  const attendant = face.localToWorld(new THREE.Vector3(3.81,sill,-5.85));
  const turn = new THREE.Vector3();
  face.getWorldDirection(turn);
  ctx.characters.push({
    id:'brown-marx-attendant', model:'bank-clerk', palette:6, lookAtVisitor:true,
    position:[attendant.x,attendant.z], groundY:sill, scale:.98,
    yawDeg:Math.atan2(turn.x,turn.z)*180/Math.PI,
  });

  const directory = new THREE.Object3D();
  directory.position.set(3.56,1.45,-4.26);
  face.add(directory);
  const visitor = new THREE.Vector3();
  ctx.registerInteractive(directory,{
    title:'Brown-Marx Directory',
    body:'Thomas Bell turns the tenant ledger toward you. “Freight offices on three, bookkeepers on four. If it’s the railway you’re after, the station’s west, past the rail sheds.”',
    available:position => {
      face.worldToLocal(visitor.copy(position));
      return visitor.z < -1.2 && visitor.z > -DEPTH && Math.abs(visitor.x) < HALF
        && visitor.distanceToSquared(directory.position) < 8.5;
    },
  });

  // The solid building wraps around the public space and its one street entrance.
  return [
    [-HALF,-halfDoor,-.44,.09], [halfDoor,HALF,-.44,.09],
    [-5.43,-3.34,-4.36,-2.66], [2.38,4.94,-5.48,-4.47],
    [-HALF,-HALF+.16,-DEPTH,0], [HALF-.16,HALF,-DEPTH,0],
  ];
}

export const lobbyDimensions = Object.freeze({halfWidth:HALF, depth:DEPTH});
