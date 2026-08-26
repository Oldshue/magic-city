/**
 * geoUtils.js — small geometry helpers for the narrative layer: point-in-
 * polygon district lookup, shared by the HUD district readout and (if ever
 * needed) the map overlay.
 */

/**
 * pointInPolygon — standard ray-casting test.
 * @param {Array<[number,number]>} polygon [x,z] vertices
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function pointInPolygon(polygon, x, z) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1];
    const xj = polygon[j][0], zj = polygon[j][1];
    const intersect = (zi > z) !== (zj > z) &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * findDistrict — returns the first district whose polygon contains (x,z).
 * @param {Array<object>} districts plan.districts
 * @param {number} x
 * @param {number} z
 * @returns {object|null}
 */
export function findDistrict(districts, x, z) {
  for (const d of districts) {
    if (pointInPolygon(d.polygon, x, z)) return d;
  }
  return null;
}
