/**
 * terminal-quarter.js — District Architect II
 *
 * TERMINAL QUARTER: the rail gateway of Magic City 1929. Centered on the
 * Byzantine-domed 1909 Terminal Station and the WELCOME TO BIRMINGHAM neon
 * gantry over the arrival tracks, with the Hotel Tutwiler Grand, the Southern
 * Railway Annex, the Birmingham Freight Exchange, ticket-agency rows, Yellow
 * Cab stand, streetcar rails of the Red Line, and dense low brick-and-
 * limestone fabric of rooming houses, lunch counters and freight offices.
 */
import * as THREE from '../../vendor/three.module.min.js';
import {
  setbackTower, corniceBox, pilasterFacade, finial, windowGrid,
  canvasSign, streetlamp, decoDoorway,
} from '../engine/deco.js';
import { materials } from '../engine/materials.js';

/** Small helper: a plain massing block. One draw call. */
function block(w, d, h, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = h / 2;
  return m;
}

/** Flat roof cap / parison cornice on a block. */
function cap(w, d, y, mat = materials.terracotta) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), mat);
  m.position.y = y;
  return m;
}

/**
 * Painted wall advertisement (ghost-sign style) drawn to canvas.
 * Returns a plane centered at origin facing +Z.
 */
function paintedAd(lines, width, height) {
  const cw = 1024, ch = Math.round(cw * height / width);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.fillStyle = '#cfc3a5';
  g.fillRect(0, 0, cw, ch);
  // weathering blotches
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(120,105,80,' + (Math.random() * 0.08).toFixed(3) + ')';
    const r = 20 + Math.random() * 90;
    g.beginPath();
    g.arc(Math.random() * cw, Math.random() * ch, r, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const big = i === 0 || i === n - 1;
    g.font = 'bold ' + (big ? Math.floor(ch * 0.13) : Math.floor(ch * 0.075)) + 'px Georgia, serif';
    g.fillStyle = big ? '#8a2f22' : '#3a352c';
    g.fillText(ln, cw / 2, ch * (i + 0.5) / n);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex })
  );
}

export async function build(ctx) {
  const { scene, plan, district, materials: M, deco, registerInteractive } = ctx;
  const root = new THREE.Group();
  root.name = 'district-terminal-quarter';
  scene.add(root);

  // ------------------------------------------------------------------
  // GROUND FABRIC — sidewalks along the avenues, plaza paving, rails
  // ------------------------------------------------------------------
  const sw = M.sidewalk || materials.sidewalk;
  const asph = M.asphalt || materials.asphalt;
  const railM = M.rail || materials.rail;

  // Sidewalk strips flanking 2nd Avenue North (z = -140).
  for (const zs of [-129, -151]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1040, 0.18, 9), sw);
    s.position.set(-680, 0.09, zs);
    root.add(s);
  }
  // Sidewalk strips flanking 3rd Avenue North (z = -280).
  for (const zs of [-269, -291]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1040, 0.18, 9), sw);
    s.position.set(-680, 0.09, zs);
    root.add(s);
  }
  // Terminal Plaza paving between station front and 2nd Avenue.
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(150, 0.16, 46), sw);
  plaza.position.set(-420, 0.08, -146);
  root.add(plaza);

  // Red Line streetcar rails running through the plaza on 2nd Ave.
  for (const zo of [-137.2, -142.8]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1040, 0.12, 0.14), railM);
    r.position.set(-680, 0.06, zo);
    root.add(r);
  }

  // ------------------------------------------------------------------
  // LANDMARK: TERMINAL STATION  (-420, -180)  96 x 64, height 40
  // Arrival hall under a tiled Byzantine dome, twin 130-ft-scale towers
  // flanking, grand arched entrances facing the plaza to the north (+Z
  // faces the plaza at z=-148; the hall runs east-west).
  // ------------------------------------------------------------------
  {
    const st = new THREE.Group();
    st.position.set(-420, 0, -180);

    // Main hall mass.
    const hallMass = block(96, 44, 20, M.limestone);
    hallMass.position.set(0, 10, 6);
    st.add(hallMass);
    // Drum under the dome.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 6, 24), M.limestone);
    drum.position.set(0, 23, 6);
    st.add(drum);
    // Byzantine dome — glazed terracotta tiles.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      M.terracotta
    );
    dome.position.set(0, 26, 6);
    st.add(dome);
    // Dome lantern + finial.
    const lant = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 3.2, 8), M.bronze);
    lant.position.set(0, 42.4, 6);
    st.add(lant);
    const lanFin = finial({ height: 4 });
    lanFin.position.set(0, 44, 6);
    st.add(lanFin);

    // Twin flanking towers (plan height 40 governs).
    for (const tx of [-41, 41]) {
      const twr = new THREE.Group();
      twr.position.set(tx, 0, 6);
      twr.add(block(13, 13, 34, M.limestone));
      // open arcade crown
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4.4, 6), M.limestone);
        col.position.set(Math.cos(ang) * 4.4, 36.2, 6 + Math.sin(ang) * 4.4);
        twr.add(col);
      }
      const tcap = corniceBox({ width: 15, depth: 15, height: 0.9 });
      tcap.position.y = 38.6;
      twr.add(tcap);
      const tf = finial({ height: 3 });
      tf.position.y = 39.05;
      twr.add(tf);
      // vertical window slot bands
      const slots = windowGrid({ rows: 8, cols: 2, spacingX: 3.4, spacingY: 3.6,
        width: 1.4, height: 2.6, material: M.glassDay });
      slots.position.set(0, 19, 6.56);
      twr.add(slots);
      st.add(twr);
    }

    // Grand entrance arcades on the plaza face (+Z, toward z = -158).
    for (const dx of [-26, 0, 26]) {
      const door = decoDoorway({ width: 5.5, height: 8.5 });
      door.scale.set(1.6, 1.5, 1.6);
      door.position.set(dx, 0, 28.2);
      st.add(door);
    }
    // Sunburst ornament above center doors.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 24, 0, Math.PI), M.terracotta
    );
    sun.position.set(0, 13.5, 28.3);
    st.add(sun);

    // Name sign over the entrances.
    const nm = canvasSign('TERMINAL STATION', { width: 22, canvasWidth: 768, canvasHeight: 128 });
    nm.position.set(0, 17.5, 28.4);
    st.add(nm);

    // Trainshed hint behind (south side): low steel ribs over the tracks.
    for (let i = 0; i < 7; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(9, 0.22, 6, 12, Math.PI), M.steelDark);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(-36 + i * 12, 0.2, -14);
      st.add(rib);
    }

    root.add(st);

    // Readable: Mayor Crandall's Belt Loop dedication, on a bronze plaque
    // beside the center doors (Voice fragment 10, verbatim).
    const plaquePed = block(2.4, 1.2, 1.1, M.limestone);
    plaquePed.position.set(-9, 0.55, 29);
    root.add(plaquePed);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 0.12), M.bronze);
    plaque.position.set(-9, 1.85, 29);
    root.add(plaque);
    registerInteractive(plaque, {
      title: 'Bronze Dedication Plaque, Terminal Plaza',
      body: '"Other cities were built where rivers ran. Ours was built where the earth itself kept a forge burning — and by God, we lit it ourselves."\n\n— Mayor Aloysius P. Crandall, ribbon-cutting at the Belt Loop, 1926',
    });
  }

  // ------------------------------------------------------------------
  // LANDMARK: WELCOME TO BIRMINGHAM SIGN  (-420, -240) rotY 180
  // 60-ft neon gantry spanning the arrival tracks south of the shed.
  // ------------------------------------------------------------------
  {
    const gn = new THREE.Group();
    gn.position.set(-420, 0, -240);
    gn.rotation.y = Math.PI; // faces the arriving trains / station
    for (const lx of [-24, 24]) {
      const leg = block(2.2, 2.2, 15, M.steelDark);
      leg.position.x = lx;
      leg.position.y = 7.5;
      gn.add(leg);
      const foot = corniceBox({ width: 3.4, depth: 3.4, height: 0.8, material: M.steelDark });
      foot.position.set(lx, 0, 0);
      gn.add(foot);
    }
    const beam = block(54, 2.4, 2.4, M.steelDark);
    beam.position.y = 14.2;
    gn.add(beam);

    // Neon sign face — custom two-line canvas, always lit (marquee logic).
    const cw = 1536, chh = 256;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = chh;
    const g = cv.getContext('2d');
    g.fillStyle = '#0c0c14'; g.fillRect(0, 0, cw, chh);
    g.strokeStyle = '#ff6a3c'; g.lineWidth = 8;
    g.strokeRect(12, 12, cw - 24, chh - 24);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 118px Georgia, serif';
    g.fillStyle = '#ffe6b0';
    g.fillText('WELCOME TO BIRMINGHAM', cw / 2, 88);
    g.font = 'bold 62px Georgia, serif';
    g.fillStyle = '#ff8a5a';
    g.fillText('STEEL CAPITAL OF THE SOUTH', cw / 2, 192);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 8),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    face.position.y = 11;
    gn.add(face);

    root.add(gn);

    // Readable: the sign itself (Voice fragment 5, verbatim).
    registerInteractive(face, {
      title: 'WELCOME TO BIRMINGHAM — Arrivals Gantry',
      body: '"WELCOME TO BIRMINGHAM — THE MAGIC CITY · POPULATION 640,000 AND PROUD OF EVERY ONE"\n\nThe neon hums over the ten tracks. Porters say you can read it from the last bend of the Bessemer Limited.',
    });
  }

  // ------------------------------------------------------------------
  // LANDMARK: HOTEL TUTWILER GRAND  (-320, -110)  26 x 30, height 46
  // Twelve stories over a marble lobby, rooftop ballroom; night-lit windows.
  // ------------------------------------------------------------------
  {
    const ht = new THREE.Group();
    ht.position.set(-320, 0, -110);
    const tower = setbackTower({
      width: 26, depth: 30, height: 42, setbacks: 3,
      material: M.limestone, windowMaterial: M.glassNight, crown: true,
    });
    ht.add(tower);
    // Rooftop ballroom pavilion beneath the finial.
    const ball = block(12, 14, 3.6, M.limestone);
    ball.position.set(0, 43.4, 0);
    ht.add(ball);
    const bcap = corniceBox({ width: 13, depth: 15, height: 0.6 });
    bcap.position.y = 45.4;
    ht.add(bcap);
    // Marquee over the entrance.
    const mq = canvasSign('HOTEL TUTWILER GRAND', { width: 18 });
    mq.position.set(0, 6.4, 15.4);
    ht.add(mq);
    // Marble-lobby doors + brass canopy hint.
    const door = decoDoorway({ width: 6, height: 6 });
    door.position.set(0, 0, 15.2);
    ht.add(door);
    root.add(ht);

    // Readable: framed first-page of the Ledger at the porte-cochere
    // (newsboy cry, Voice fragment 8, verbatim).
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 0.1), M.bronze);
    frame.position.set(6.5, 2.2, 15.35);
    root.add(frame);
    registerInteractive(frame, {
      title: 'Framed Extra — The Birmingham Ledger',
      body: '"EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!"\n\nThe October 1928 extra, framed behind glass by the doorman who sold it.',
    });
  }

  // ------------------------------------------------------------------
  // SECONDARY LANDMARKS — Southern Railway Annex & Freight Exchange
  // ------------------------------------------------------------------
  {
    // Southern Railway Annex (-540, -170)
    const annex = new THREE.Group();
    annex.position.set(-540, 0, -170);
    annex.add(block(34, 22, 14, M.brick));
    annex.add(cap(34, 22, 14.2));
    const pil = pilasterFacade({ width: 34, height: 14, bays: 7 });
    pil.position.set(0, 0, 11.3);
    annex.add(pil);
    const asn = canvasSign('SOUTHERN RAILWAY ANNEX', { width: 16 });
    asn.position.set(0, 12.4, 11.5);
    annex.add(asn);
    const adoor = decoDoorway({ width: 4.5, height: 5.5 });
    adoor.position.set(0, 0, 11.2);
    annex.add(adoor);
    root.add(annex);

    // Birmingham Freight Exchange (-700, -230)
    const fx = new THREE.Group();
    fx.position.set(-700, 0, -230);
    fx.add(block(40, 26, 16, M.brick));
    fx.add(cap(40, 26, 16.2));
    const fwin = windowGrid({ rows: 4, cols: 9, spacingX: 3.8, spacingY: 3.2,
      width: 2, height: 2.4, material: M.glassNight });
    fwin.position.set(0, 9, 13.1);
    fx.add(fwin);
    const fxn = canvasSign('BIRMINGHAM FREIGHT EXCHANGE', { width: 22 });
    fxn.position.set(0, 14.6, 13.2);
    fx.add(fxn);
    root.add(fx);

    // Cotton factor / ticket-agency row along 2nd Ave (north side, z=-124).
    const shops = [
      ['DIXIE TICKET AGENCY', -260],
      ['PULLMAN RESERVATIONS', -290],
      ['YELLOW CAB CO.', -350],
      ['FLOWERS — PLAZA FLORIST', -380],
    ];
    for (const [label, x] of shops) {
      const sh = new THREE.Group();
      sh.position.set(x, 0, -122);
      sh.add(block(24, 14, 9, M.brick));
      sh.add(cap(24, 14, 9.2));
      const sn = canvasSign(label, { width: 14, canvasWidth: 640, canvasHeight: 112 });
      sn.position.set(0, 7.4, 7.1);
      sh.add(sn);
      const sd = decoDoorway({ width: 3.4, height: 4.2 });
      sd.position.set(-4, 0, 7);
      sh.add(sd);
      root.add(sh);
    }
  }

  // ------------------------------------------------------------------
  // NEWSPAPER STAND — Terminal Plaza kiosk
  // ------------------------------------------------------------------
  {
    const kiosk = new THREE.Group();
    kiosk.position.set(-370, 0, -132);
    const body = block(4, 3, 2.6, M.steelDark);
    body.position.y = 1.3;
    kiosk.add(body);
    const hood = corniceBox({ width: 4.8, depth: 3.6, height: 0.4, material: M.marquee });
    hood.position.y = 2.8;
    kiosk.add(hood);
    const kn = canvasSign('THE BIRMINGHAM LEDGER — TWO CENTS', { width: 4.6, canvasWidth: 512, canvasHeight: 96 });
    kn.position.set(0, 2.1, 1.55);
    kiosk.add(kn);
    root.add(kiosk);
    registerInteractive(kiosk.children[2], {
      title: 'Newsstand Front Page — October 1928 Extra',
      body: '"EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!"\n\nFresh stack still tied in twine beside the Age-Herald evening edition.',
    });
  }

  // ------------------------------------------------------------------
  // PAINTED ADVERTISEMENT — ghost sign on a warehouse flank
  // (Voice fragment 3, verbatim)
  // ------------------------------------------------------------------
  {
    const host = block(30, 18, 18, M.brick);
    host.position.set(-620, 9, -90);
    root.add(host);
    root.add(cap(30, 18, 18.2));
    const ad = paintedAd([
      'MADE WHERE IT\'S MINED!',
      'One ton of TC steel crosses our yard in ninety minutes —',
      'ore, limestone, coal, fire. Ask your dealer why northern steel',
      'costs more to haul less.',
      'TC IRON — THE SOUTH\'S OWN METAL.',
    ], 26, 10);
    ad.position.set(-620, 9, -80.9);
    root.add(ad);
    registerInteractive(ad, {
      title: 'Painted Wall Advertisement — TC Iron',
      body: '"MADE WHERE IT\'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH\'S OWN METAL."',
    });
  }

  // ------------------------------------------------------------------
  // BACKGROUND INFILL — rooming houses, lunch counters, freight offices.
  // Brick and limestone low-rises (3–7 stories) filling the blocks between
  // 22nd/23rd/24th Streets and the avenues, clear of landmarks and streets.
  // [x, z, w, d, stories]
  // ------------------------------------------------------------------
  const infill = [
    [-200, -250, 22, 18, 4], [-260, -255, 20, 16, 3], [-310, -250, 24, 18, 5],
    [-360, -252, 20, 16, 4], [-470, -250, 26, 18, 3], [-520, -255, 22, 16, 4],
    [-580, -250, 24, 18, 5], [-650, -255, 26, 18, 3], [-720, -250, 24, 16, 4],
    [-800, -252, 28, 18, 3], [-900, -250, 30, 20, 4], [-1000, -255, 28, 18, 3],
    [-1080, -250, 26, 18, 4],
    [-200, -75, 20, 16, 4], [-260, -78, 22, 16, 5], [-360, -76, 20, 16, 3],
    [-430, -78, 22, 18, 4], [-520, -76, 24, 16, 3], [-580, -80, 22, 18, 5],
    [-700, -76, 26, 16, 3], [-780, -78, 24, 18, 4], [-860, -76, 26, 16, 3],
    [-960, -80, 30, 18, 4], [-1060, -76, 28, 18, 3],
    [-220, -20, 22, 16, 4], [-300, -22, 20, 16, 3], [-450, -20, 24, 18, 4],
    [-560, -22, 22, 16, 3], [-680, -20, 26, 18, 4], [-800, -22, 28, 16, 3],
    [-920, -20, 30, 18, 4], [-1040, -22, 28, 16, 3],
    // western freight-yard warehouses (low, deep, brick)
    [-1140, -180, 60, 40, 2], [-1130, -60, 70, 44, 2],
  ];
  const winRows = [];
  infill.forEach(([x, z, w, d, st], i) => {
    const h = st * 3.4;
    const mat = i % 3 === 0 ? M.limestone : M.brick;
    const b = block(w, d, h, mat);
    b.position.set(x, h / 2, z);
    root.add(b);
    root.add(cap(w, d, h + 0.25));
    if (i % 3 === 1 && st >= 4) {
      const wg = windowGrid({ rows: st, cols: Math.max(3, Math.floor(w / 5)),
        spacingX: w / Math.max(3, Math.floor(w / 5)), spacingY: 3.4,
        width: 1.5, height: 2.2, material: M.glassNight });
      wg.position.set(x, h / 2, z + d / 2 + 0.07);
      root.add(wg);
      winRows.push(wg);
    }
  });

  // ------------------------------------------------------------------
  // STREET-WALL FAN-OUT — EAST DOWNTOWN + MORRIS WAREHOUSE ROW
  // (terminal-quarter assigned blocks). Continuous 1929 party-wall
  // street fabric via deco.blockFill for the seven blocks assigned to
  // this district (centroid-in-polygon test against both
  // terminal-quarter [x -1200..-160] and heaviest-corner [x -160..220]
  // polygons read from data/city-plan.json). Existing AABBs from the
  // run brief are expressed as frontage gaps with 2 m clearance, sized
  // to each lot's ~20 m max depth reach so the fill never intersects
  // them. seed = x0*7+z0 per block, deterministic across reruns.
  // Warehouse rows (z0=14) face Morris Avenue to the south; alley is
  // disabled per brief rule 2. Purely additive — nothing above this
  // section is modified.
  // ------------------------------------------------------------------

  // Block 1: x -468..-372, z -268..-152. commercial, floors 2-5.
  root.add(deco.blockFill({
    materials: M, deco, seed: -3544,
    block: { x0: -468, z0: -268, x1: -372, z1: -152 },
    gaps: [
      { side: 'south', from: -470, to: -370 },
      { side: 'west', from: -198, to: -150 },
      { side: 'east', from: -198, to: -150 },
      { side: 'west', from: -261, to: -239 },
      { side: 'north', from: -470, to: -455 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block 2: x -348..-252, z -268..-152. commercial, floors 2-5.
  root.add(deco.blockFill({
    materials: M, deco, seed: -2704,
    block: { x0: -348, z0: -268, x1: -252, z1: -152 },
    gaps: [
      { side: 'east', from: -265, to: -245 },
      { side: 'north', from: -272, to: -250 },
      { side: 'north', from: -324, to: -296 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block 3: x -468..-372, z -128..-12. commercial, floors 2-5.
  root.add(deco.blockFill({
    materials: M, deco, seed: -3404,
    block: { x0: -468, z0: -128, x1: -372, z1: -12 },
    gaps: [
      { side: 'north', from: -394, to: -366 },
      { side: 'east', from: -131, to: -113 },
      { side: 'south', from: -464, to: -436 },
      { side: 'west', from: -31, to: -9 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block 4: x -348..-252, z -128..-12. commercial, floors 2-5.
  root.add(deco.blockFill({
    materials: M, deco, seed: -2564,
    block: { x0: -348, z0: -128, x1: -252, z1: -12 },
    gaps: [
      { side: 'north', from: -335, to: -305 },
      { side: 'east', from: -131, to: -113 },
      { side: 'north', from: -274, to: -250 },
      { side: 'north', from: -304, to: -276 },
      { side: 'west', from: -131, to: -113 },
      { side: 'north', from: -350, to: -336 },
      { side: 'east', from: -88, to: -68 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block 5: x -468..-372, z 14..46. warehouse (Morris Ave row), no
  // existing structures.
  root.add(deco.blockFill({
    materials: M, deco, seed: -3262,
    block: { x0: -468, z0: 14, x1: -372, z1: 46 },
    gaps: [],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  // Block 6: x -348..-252, z 14..46. warehouse (Morris Ave row), no
  // existing structures.
  root.add(deco.blockFill({
    materials: M, deco, seed: -2422,
    block: { x0: -348, z0: 14, x1: -252, z1: 46 },
    gaps: [],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  // Block 7: x -228..-132, z 14..46. warehouse (Morris Ave row), no
  // existing structures. Block centroid (x -180) falls inside the
  // terminal-quarter polygon (x <= -160), so it is built here even
  // though its east edge approaches heaviest-corner's boundary.
  root.add(deco.blockFill({
    materials: M, deco, seed: -1582,
    block: { x0: -228, z0: 14, x1: -132, z1: 46 },
    gaps: [],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  // ------------------------------------------------------------------
  // STREETSCAPE — instanced streetlamps along the plaza & 2nd Avenue,
  // plus a few helper-built lamps at focal points.
  // ------------------------------------------------------------------
  {
    const spots = [];
    for (let x = -500; x <= -340; x += 32) spots.push([x, -126]);
    for (let x = -500; x <= -340; x += 32) spots.push([x, -166]);
    spots.push([-270, -126], [-330, -126], [-400, -126]);
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.12, 4.6, 8);
    const globeGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const globeMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const poles = new THREE.InstancedMesh(poleGeo, M.steelDark, spots.length);
    const globes = new THREE.InstancedMesh(globeGeo, globeMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 2.3, z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(x, 4.65, z);
      globes.setMatrixAt(i, m4);
    });
    poles.instanceMatrix.needsUpdate = true;
    globes.instanceMatrix.needsUpdate = true;
    root.add(poles);
    root.add(globes);

    // A couple of hero lamps by the station doors using the shared helper.
    for (const lx of [-14, 14]) {
      const lp = streetlamp();
      lp.position.set(-420 + lx, 0, -150); // flanking Terminal Plaza, before the doors
      root.add(lp);
    }
  }

  return root;
}
