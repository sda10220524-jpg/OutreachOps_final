const PI = Math.PI;
const R2D = 180 / PI;

export const W_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const K_MIN = 10;

export function selectGridZ(zoom) {
  if (zoom < 7) return 6;
  if (zoom < 11) return 9;
  return 12;
}

export function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / PI) / 2 * n);
  return { x, y };
}

export function tileToBounds(x, y, z) {
  const n = 2 ** z;
  const lng1 = x / n * 360 - 180;
  const lng2 = (x + 1) / n * 360 - 180;
  const lat1 = Math.atan(Math.sinh(PI * (1 - 2 * y / n))) * R2D;
  const lat2 = Math.atan(Math.sinh(PI * (1 - 2 * (y + 1) / n))) * R2D;
  return [lng1, lat2, lng2, lat1];
}

export function toGridId(x, y, z) {
  return `z${z}_x${x}_y${y}`;
}

export function parseGridId(gridId) {
  const m = /^z(\d+)_x(\d+)_y(\d+)$/.exec(gridId);
  if (!m) return null;
  return { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
}

export function getVisibleGridCells(map, gridZ) {
  const b = map.getBounds();
  const nw = lngLatToTile(b.getWest(), b.getNorth(), gridZ);
  const se = lngLatToTile(b.getEast(), b.getSouth(), gridZ);
  const cells = [];
  for (let x = Math.max(0, nw.x - 1); x <= se.x + 1; x++) {
    for (let y = Math.max(0, nw.y - 1); y <= se.y + 1; y++) {
      const [w, s, e, n] = tileToBounds(x, y, gridZ);
      cells.push({
        grid_id: toGridId(x, y, gridZ),
        polygon: [[w, s], [e, s], [e, n], [w, n], [w, s]]
      });
    }
  }
  return cells;
}

export function classifyLevels(cells) {
  const publishable = cells.filter((c) => !c.dataInsufficient).sort((a, b) => b.priority - a.priority);
  if (publishable.length === 1) publishable[0].classLevel = '중간';
  else if (publishable.length === 2) {
    publishable[0].classLevel = '높음';
    publishable[1].classLevel = '낮음';
  } else {
    const n = publishable.length;
    const highCut = Math.ceil(n * 0.3);
    const medCut = Math.ceil(n * 0.7);
    publishable.forEach((cell, idx) => {
      if (idx < highCut) cell.classLevel = '높음';
      else if (idx < medCut) cell.classLevel = '중간';
      else cell.classLevel = '낮음';
    });
  }
  cells.forEach((cell) => {
    if (cell.dataInsufficient) cell.classLevel = '데이터 부족';
  });
  return cells;
}
