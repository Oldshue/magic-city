/** Project any world waypoint onto the existing map's responsive overlay. */
export function projectWaypoints(bounds, waypoints) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (!(width > 0) || !(depth > 0)) return [];
  return waypoints.flatMap(item => {
    if (!Array.isArray(item.position) || !item.position.every(Number.isFinite) || item.position.length !== 2) return [];
    const x = (item.position[0] - bounds.minX) / width;
    const y = (item.position[1] - bounds.minZ) / depth;
    if (x < 0 || x > 1 || y < 0 || y > 1) return [];
    return [{ ...item, x, y }];
  });
}
