import { classifyViewportCells, gridIdFromTile, lngLatToTileXY, parseGridId, selectGridZ, visibleGridCells } from './grid.js';

export function createGridMap({ containerId, onSelectGrid, center = [126.978, 37.566], zoom = 9 }) {
  const map = new maplibregl.Map({
    container: containerId,
    center,
    zoom,
    attributionControl: true,
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
    }
  });

  let selectedGridId = null;

  map.on('load', () => {
    map.addSource('grid-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'grid-fill-publishable',
      type: 'fill',
      source: 'grid-src',
      filter: ['!=', ['get', 'level'], '데이터 부족'],
      paint: {
        'fill-color': [
          'match', ['get', 'level'],
          '높음', '#c65c4f',
          '중간', '#c18c34',
          '낮음', '#2e8d88',
          '#2e8d88'
        ],
        'fill-opacity': 0.24
      }
    });

    map.addLayer({
      id: 'grid-fill-insufficient',
      type: 'fill',
      source: 'grid-src',
      filter: ['==', ['get', 'level'], '데이터 부족'],
      paint: {
        'fill-color': '#2b3e57',
        'fill-opacity': 0.25
      }
    });

    map.addLayer({
      id: 'grid-insufficient-hatch',
      type: 'line',
      source: 'grid-src',
      filter: ['==', ['get', 'level'], '데이터 부족'],
      paint: {
        'line-color': '#8197b3',
        'line-width': 1.4,
        'line-dasharray': [1.3, 1.3]
      }
    });

    map.addLayer({
      id: 'grid-line',
      type: 'line',
      source: 'grid-src',
      paint: {
        'line-color': '#93a9c3',
        'line-width': 1
      }
    });

    map.addLayer({
      id: 'grid-selected',
      type: 'line',
      source: 'grid-src',
      filter: ['==', ['get', 'grid_id'], ''],
      paint: {
        'line-color': '#f3fbff',
        'line-width': 3.5
      }
    });

    map.addLayer({
      id: 'grid-label',
      type: 'symbol',
      source: 'grid-src',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12
      },
      paint: {
        'text-color': '#f3f8ff',
        'text-halo-color': '#0f1722',
        'text-halo-width': 1.3
      }
    });

    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['grid-fill-publishable', 'grid-fill-insufficient', 'grid-line', 'grid-insufficient-hatch']
      });
      let id = features[0]?.properties?.grid_id;
      if (!id) {
        const z = selectGridZ(map.getZoom());
        const tile = lngLatToTileXY(e.lngLat.lng, e.lngLat.lat, z);
        id = gridIdFromTile(tile.x, tile.y, z);
      }
      if (id) onSelectGrid(id);
    });
  });

  function render(metricMap, selectedId) {
    selectedGridId = selectedId || selectedGridId;
    if (!map.getSource('grid-src')) return [];

    const z = selectGridZ(map.getZoom());
    const cells = visibleGridCells(map, z).map((c) => {
      const m = metricMap.get(c.grid_id) || {
        grid_id: c.grid_id,
        uniqueSignals: 0,
        demand: 0,
        capacity: 1,
        priority: 0,
        anomaly: false,
        dataInsufficient: true
      };
      return { ...c, ...m };
    });

    classifyViewportCells(cells);

    const features = cells.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: c.polygon },
      properties: {
        grid_id: c.grid_id,
        level: c.level,
        label: c.level === '데이터 부족' ? '데이터 부족' : c.level
      }
    }));

    map.getSource('grid-src').setData({ type: 'FeatureCollection', features });
    map.setFilter('grid-selected', ['==', ['get', 'grid_id'], selectedGridId || '']);
    return cells;
  }

  function visibleGridIds() {
    const z = selectGridZ(map.getZoom());
    return visibleGridCells(map, z).map((c) => c.grid_id);
  }

  function focusGrid(gridId) {
    const parsed = parseGridId(gridId);
    if (!parsed) return;
    const n = 2 ** parsed.z;
    const lng = ((parsed.x + 0.5) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (parsed.y + 0.5)) / n))) * 180) / Math.PI;
    map.flyTo({ center: [lng, lat], zoom: Math.max(parsed.z - 1, map.getZoom()) });
  }

  return { map, render, visibleGridIds, focusGrid };
}
