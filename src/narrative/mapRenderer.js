/**
 * mapRenderer.js — draws the stylized 1929 city map to a plain 2D canvas
 * from data/city-plan.json: district shapes, streets, streetcar lines in
 * their canon colors, landmark dots with names, and a deco border with
 * corner sunbursts. Player position is drawn separately (see index.js
 * updateMapMarker) as a cheap moving HTML element so the map canvas itself
 * is only ever painted once — no per-frame canvas redraw cost.
 */

/**
 * worldToMap — projects a world (x,z) meter coordinate onto a size x size
 * canvas using the plan's bounds. North (-Z) maps to the top of the canvas.
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @param {number} size canvas width/height in px (square)
 * @param {number} x
 * @param {number} z
 * @returns {{x:number,y:number}}
 */
export function worldToMap(bounds, size, x, z) {
  const px = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * size;
  const py = ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * size;
  return { x: px, y: py };
}

const DISTRICT_PALETTE = ['#cdbf98', '#c3b98f', '#b9ae86', '#cfc39c', '#c7bb92', '#bdb28a', '#d2c6a0', '#c0b58c'];

/**
 * drawBaseMap — paints the static map once onto `canvas` (sized size x size).
 * @param {HTMLCanvasElement} canvas
 * @param {object} plan the full city-plan.json object
 * @param {number} size
 */
export function drawBaseMap(canvas, plan, size) {
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const bounds = plan.bounds;
  const toMap = (x, z) => worldToMap(bounds, size, x, z);

  // Parchment ground + vignette.
  g.fillStyle = '#e9dfc0';
  g.fillRect(0, 0, size, size);
  const vg = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(60,45,20,0.25)');
  g.fillStyle = vg;
  g.fillRect(0, 0, size, size);

  // District polygons.
  plan.districts.forEach((d, i) => {
    g.beginPath();
    d.polygon.forEach(([x, z], idx) => {
      const p = toMap(x, z);
      if (idx === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    });
    g.closePath();
    g.fillStyle = DISTRICT_PALETTE[i % DISTRICT_PALETTE.length];
    g.globalAlpha = 0.55;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(90,70,35,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
  });

  // Streets.
  g.strokeStyle = 'rgba(70,55,30,0.55)';
  plan.streets.forEach((st) => {
    g.lineWidth = st.class === 'avenue' ? 2.4 : st.class === 'street' ? 1.4 : 0.8;
    g.beginPath();
    st.path.forEach(([x, z], idx) => {
      const p = toMap(x, z);
      if (idx === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    });
    g.stroke();
  });

  // Streetcar lines in canon colors.
  plan.streetcarLines.forEach((line) => {
    g.strokeStyle = line.color;
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    line.path.forEach(([x, z], idx) => {
      const p = toMap(x, z);
      if (idx === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    });
    if (line.loop) g.closePath();
    g.stroke();
  });
  g.setLineDash([]);

  // Landmark dots + names.
  plan.landmarks.forEach((lm) => {
    const p = toMap(lm.position[0], lm.position[1]);
    g.fillStyle = '#7a1f1f';
    g.beginPath();
    g.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2115';
    g.font = '600 9px Georgia, serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(lm.name, p.x + 5, p.y);
  });

  drawDecoBorder(g, size);
}

/** drawDecoBorder — double rule frame with corner sunburst rays. */
function drawDecoBorder(g, size) {
  const margin = 14;
  g.strokeStyle = '#6e5426';
  g.lineWidth = 4;
  g.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
  g.lineWidth = 1.5;
  g.strokeRect(margin + 7, margin + 7, size - (margin + 7) * 2, size - (margin + 7) * 2);
  const corners = [
    [margin, margin], [size - margin, margin],
    [margin, size - margin], [size - margin, size - margin],
  ];
  corners.forEach(([cx, cy]) => {
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180;
      g.strokeStyle = 'rgba(110,84,38,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(rad) * 16, cy + Math.sin(rad) * 16);
      g.stroke();
    }
  });
}
