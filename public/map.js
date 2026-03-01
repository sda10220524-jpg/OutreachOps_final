import { classifyLevels, getVisibleGridCells, parseGridId, selectGridZ } from './grid.js';

export function createMap({ onCellSelect }) {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.' + 'png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    },
    center: [126.978, 37.566],
    zoom: 9
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', () => {
    const pattern = document.createElement('canvas');
    pattern.width = 8; pattern.height = 8;
    const ctx = pattern.getContext('2d');
    ctx.strokeStyle = '#6f7f8f';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,8); ctx.lineTo(8,0); ctx.stroke();
    map.addImage('hatch', pattern, { pixelRatio: 2 });

    map.addSource('grid', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'grid-fill', type: 'fill', source: 'grid',
      paint: {
        'fill-color': [
          'match', ['get', 'classLevel'],
          '높음', '#ca5c48',
          '중간', '#cb8f2b',
          '낮음', '#2d8f88',
          'rgba(0,0,0,0)'
        ],
        'fill-opacity': 0.35
      }
    });
    map.addLayer({
      id: 'grid-hatch', type: 'fill', source: 'grid',
      filter: ['==', ['get', 'classLevel'], '데이터 부족'],
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.45 }
    });
    map.addLayer({ id: 'grid-line', type: 'line', source: 'grid', paint: { 'line-color': '#8fa7bf', 'line-width': 0.7 } });
    map.addLayer({
      id: 'grid-label', type: 'symbol', source: 'grid',
      layout: { 'text-field': ['get', 'classLevel'], 'text-size': 12 },
      paint: { 'text-color': '#f2f6fa', 'text-halo-color': '#0f1722', 'text-halo-width': 1 }
    });

    map.on('click', 'grid-fill', (e) => {
      const feature = e.features?.[0];
      if (feature) onCellSelect(feature.properties.grid_id);
    });
  });

  function renderGrid(cellMetrics) {
    if (!map.getSource('grid')) return;
    const gridZ = selectGridZ(map.getZoom());
    const visible = getVisibleGridCells(map, gridZ).map((cell) => {
      const m = cellMetrics.get(cell.grid_id) || { uniqueSignals: 0, demand: 0, capacity: 1, priority: 0, dataInsufficient: true };
      return { ...cell, ...m };
    });
    classifyLevels(visible);
    const features = visible.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [c.polygon] },
      properties: { grid_id: c.grid_id, classLevel: c.classLevel, demand: c.demand.toFixed(2), capacity: c.capacity, priority: c.priority.toFixed(2), anomaly: c.anomaly ? '⚠ spike' : '' }
    }));
    map.getSource('grid').setData({ type: 'FeatureCollection', features });
    return visible;
  }

  function jumpToGrid(gridId) {
    const p = parseGridId(gridId);
    if (!p) return;
    const n = 2 ** p.z;
    const lng = ((p.x + 0.5) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * (p.y + 0.5) / n))) * 180) / Math.PI;
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), p.z - 1) });
  }

  return { map, renderGrid, jumpToGrid };
}
