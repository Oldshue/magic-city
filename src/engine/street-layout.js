import * as THREE from '../../vendor/three.module.min.js';

export const ROAD_HEIGHT = 0.02;
export const SIDEWALK_HEIGHT = 0.16;
const CURB_WIDTH = 3;
const EPSILON = 1e-7;

export function getStreetSegments(streets) {
  return streets.flatMap(({name, path, width}) => path.slice(1).flatMap(([x1, z1], index) => {
    const [x0, z0] = path[index];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    return length > EPSILON ? [{name, x0, z0, dx, dz, length, halfWidth: width / 2}] : [];
  }));
}

export function inRoad(x, z, segments, clearance = 0) {
  return segments.some(({x0, z0, dx, dz, length, halfWidth}) => {
    const px = x - x0;
    const pz = z - z0;
    const along = (px * dx + pz * dz) / length;
    return along >= 0 && along <= length
      && Math.abs(px * dz - pz * dx) / length < halfWidth + clearance;
  });
}

function ribbon({x0, z0, dx, dz, length}, low, high) {
  const nx = -dz / length;
  const nz = dx / length;
  return [
    [x0 + nx * low, z0 + nz * low],
    [x0 + dx + nx * low, z0 + dz + nz * low],
    [x0 + dx + nx * high, z0 + dz + nz * high],
    [x0 + nx * high, z0 + nz * high],
  ];
}

function bounds(ring) {
  return ring.reduce(({minX, minZ, maxX, maxZ}, [x, z]) => ({
    minX: Math.min(minX, x), minZ: Math.min(minZ, z),
    maxX: Math.max(maxX, x), maxZ: Math.max(maxZ, z),
  }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
}

function intersects(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function hasArea(ring) {
  if (ring.length < 3) return false;
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i];
    const [nextX, nextZ] = ring[(i + 1) % ring.length];
    twiceArea += x * nextZ - z * nextX;
  }
  return twiceArea > EPSILON;
}

// Remove a convex road ribbon by peeling off the part outside each edge.
// The remainder after the last edge is the portion occupied by the road.
function subtractRoad(subject, road) {
  let interior = subject;
  const kept = [];
  for (let edge = 0; edge < road.length && interior.length; edge++) {
    const [ex, ez] = road[edge];
    const [endX, endZ] = road[(edge + 1) % road.length];
    const dx = endX - ex;
    const dz = endZ - ez;
    const outside = [];
    const inside = [];
    let previous = interior.at(-1);
    let previousDistance = dx * (previous[1] - ez) - dz * (previous[0] - ex);
    for (const point of interior) {
      const distance = dx * (point[1] - ez) - dz * (point[0] - ex);
      const crossed = (previousDistance > EPSILON && distance < -EPSILON)
        || (previousDistance < -EPSILON && distance > EPSILON);
      if (crossed) {
        const t = previousDistance / (previousDistance - distance);
        const meeting = [
          previous[0] + (point[0] - previous[0]) * t,
          previous[1] + (point[1] - previous[1]) * t,
        ];
        inside.push(meeting);
        outside.push(meeting);
      }
      if (distance >= -EPSILON) inside.push(point);
      if (distance <= EPSILON) outside.push(point);
      previous = point;
      previousDistance = distance;
    }
    if (hasArea(outside)) kept.push(outside);
    interior = inside;
  }
  return kept;
}

function roadOutline(segment) {
  return ribbon(segment, -segment.halfWidth, segment.halfWidth);
}

export function clipPavement(pavement, segments, ownSegment) {
  let pieces = [pavement];
  const pavementBounds = bounds(pavement);
  for (const segment of segments) {
    if (segment === ownSegment) continue;
    const road = roadOutline(segment);
    const roadBounds = bounds(road);
    if (!intersects(pavementBounds, roadBounds)) continue;
    pieces = pieces.flatMap(piece => intersects(bounds(piece), roadBounds) ? subtractRoad(piece, road) : [piece]);
  }
  return pieces;
}

export function sidewalkRibbons(segment, segments) {
  return [
    ...clipPavement(ribbon(segment, -segment.halfWidth - CURB_WIDTH, -segment.halfWidth), segments, segment),
    ...clipPavement(ribbon(segment, segment.halfWidth, segment.halfWidth + CURB_WIDTH), segments, segment),
  ];
}

function meshForRings(rings, height, material, edges) {
  const positions = [];
  const uvs = [];
  const put = (point, y) => {
    positions.push(point[0], y, point[1]);
    uvs.push(point[0], point[1]);
  };
  for (const ring of rings) {
    for (let i = 1; i < ring.length - 1; i++) {
      put(ring[0], height);
      put(ring[i + 1], height);
      put(ring[i], height);
    }
    if (!edges) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      put(a, ROAD_HEIGHT); put(b, height); put(b, ROAD_HEIGHT);
      put(a, ROAD_HEIGHT); put(a, height); put(b, height);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  mesh.userData.streetTop = { rings, height };
  return mesh;
}

export function addStreetSurfaces(scene, segments, materials) {
  for (const segment of segments) {
    const road = meshForRings([roadOutline(segment)], ROAD_HEIGHT, materials.asphalt, false);
    road.name = 'Road · ' + segment.name;
    scene.add(road);
    const rings = sidewalkRibbons(segment, segments);
    if (rings.length) {
      const sidewalk = meshForRings(rings, SIDEWALK_HEIGHT, materials.sidewalk, true);
      sidewalk.name = 'Sidewalk · ' + segment.name;
      scene.add(sidewalk);
    }
  }
}

export function addPavementApron(parent, segments, material, {minX, maxX, minZ, maxZ}) {
  const rectangle = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
  const rings = clipPavement(rectangle, segments);
  const apron = meshForRings(rings, SIDEWALK_HEIGHT, material, true);
  apron.name = 'Pavement apron';
  parent.add(apron);
}


// Find the closest point of a convex pavement top in the tire's rolling
// plane. The tire can touch a curb before the center reaches its edge.
function closestContact(surface, x, z, fx, fz, radius) {
  let near = -radius;
  let far = radius;
  for (const { ex, ez, dx, dz } of surface.edges) {
    const offset = dx * (z - ez) - dz * (x - ex);
    const rate = dx * fz - dz * fx;
    if (rate > EPSILON) near = Math.max(near, -offset / rate);
    else if (rate < -EPSILON) far = Math.min(far, -offset / rate);
    else if (offset < -EPSILON) return Infinity;
    if (near > far) return Infinity;
  }
  return Math.max(near, -far, 0);
}

/** Return the height of a rolling tire's bottom above the ground plane. */
export function createStreetContact(scene, radius, halfTread = 0) {
  const surfaces = [];
  const vertex = new THREE.Vector3();
  scene.traverse(mesh => {
    const top = mesh.userData.streetTop;
    if (!top) return;
    mesh.updateWorldMatrix(true, false);
    for (const ring of top.rings) {
      const world = ring.map(([x, z]) => {
        vertex.set(x, top.height, z).applyMatrix4(mesh.matrixWorld);
        return [vertex.x, vertex.z];
      });
      const edges = world.map(([ex, ez], i) => {
        const [x, z] = world[(i + 1) % world.length];
        return { ex, ez, dx: x - ex, dz: z - ez };
      });
      surfaces.push({ ...bounds(world), edges, height: vertex.y });
    }
  });

  const reach = radius + halfTread;
  const tread = halfTread ? [-halfTread, 0, halfTread] : [0];
  const radiusSquared = radius * radius;
  return (x, z, yaw) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let height = 0;
    for (const surface of surfaces) {
      if (height >= surface.height || x + reach < surface.minX || x - reach > surface.maxX
          || z + reach < surface.minZ || z - reach > surface.maxZ) continue;
      for (const offset of tread) {
        const distance = closestContact(surface, x + fz * offset, z - fx * offset, fx, fz, radius);
        if (distance <= radius) {
          height = Math.max(height, surface.height + Math.sqrt(radiusSquared - distance * distance) - radius);
        }
      }
    }
    return height;
  };
}
