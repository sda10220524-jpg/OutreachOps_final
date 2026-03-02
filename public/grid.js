const PI = Math.PI;
const RAD_TO_DEG = 180 / PI;

export const W_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const K_ANON = 10;

export function selectGridZ(zoom) {
  if (zoom < 7) return 6;
  if (zoom < 11) return 9;
  return 12;
}

export function lngLatToTileXY(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / PI) / 2) * n);
  return { x, y };
}

export function tileXYToBBox(x, y, z) {
  const n = 2 ** z;
  const minLng = (x / n) * 360 - 180;
  const maxLng = ((x + 1) / n) * 360 - 180;
  const maxLat = Math.atan(Math.sinh(PI * (1 - (2 * y) / n))) * RAD_TO_DEG;
  const minLat = Math.atan(Math.sinh(PI * (1 - (2 * (y + 1)) / n))) * RAD_TO_DEG;
  return [minLng, minLat, maxLng, maxLat];
}

export function bboxToPolygon([minLng, minLat, maxLng, maxLat]) {
  return [[
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat]
  ]];
}

export function gridIdFromTile(x, y, z) {
  return `z${z}_x${x}_y${y}`;
}

export function parseGridId(gridId) {
  const m = /^z(\d+)_x(\d+)_y(\d+)$/.exec(gridId || '');
  if (!m) return null;
  return { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
}

export function visibleGridCells(map, z) {
  const b = map.getBounds();
  const nw = lngLatToTileXY(b.getWest(), b.getNorth(), z);
  const se = lngLatToTileXY(b.getEast(), b.getSouth(), z);
  const max = (2 ** z) - 1;
  const cells = [];

  for (let x = Math.max(0, nw.x - 1); x <= Math.min(max, se.x + 1); x += 1) {
    for (let y = Math.max(0, nw.y - 1); y <= Math.min(max, se.y + 1); y += 1) {
      const bbox = tileXYToBBox(x, y, z);
      cells.push({
        grid_id: gridIdFromTile(x, y, z),
        z,
        x,
        y,
        polygon: bboxToPolygon(bbox)
      });
    }
  }
  return cells;
}

export function classifyViewportCells(cells) {
  const publishable = cells
    .filter((c) => !c.dataInsufficient)
    .sort((a, b) => b.demand - a.demand);

  if (publishable.length === 1) {
    publishable[0].level = '중간';
  } else if (publishable.length === 2) {
    publishable[0].level = '높음';
    publishable[1].level = '낮음';
  } else if (publishable.length > 2) {
    const n = publishable.length;
    const highCut = Math.ceil(n * 0.3);
    const medCut = Math.ceil(n * 0.7);
    publishable.forEach((c, idx) => {
      if (idx < highCut) c.level = '높음';
      else if (idx < medCut) c.level = '중간';
      else c.level = '낮음';
    });
  }

  cells.forEach((c) => {
    if (c.dataInsufficient) c.level = '데이터 부족';
  });

  return cells;
}
