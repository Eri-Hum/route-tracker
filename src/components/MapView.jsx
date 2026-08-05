import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import DrawCanvas from './DrawCanvas';

// Leaflet's default marker icons reference image assets by relative path,
// which breaks under bundlers. Point them at the CDN copies instead.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [57.7089, 11.9746]; // Gothenburg, Sweden

function RecenterOnPosition({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, 15);
    }
  }, [position, map]);
  return null;
}

// Fires only for an actual touch/mouse drag - not for the programmatic
// setView() above - so recentring on a fresh location fix never triggers it.
function NotifyOnDrag({ onDragStart }) {
  useMapEvents({ dragstart: () => onDragStart?.() });
  return null;
}

export default function MapView({
  mode,
  drawingActive,
  onRouteComplete,
  onMapDragStart,
  drawnPoints,
  resumeFrom,
  userPosition,
  route,
}) {
  return (
    <MapContainer
      center={userPosition || DEFAULT_CENTER}
      zoom={13}
      className="map-container"
      // No corner is free of floating chrome on mobile: the topbar spans
      // the full top edge and the sheet the full bottom one. Rather than
      // plant +/- buttons on top of either, this leans on pinch/scroll zoom
      // (a locate button covers the one thing zoom buttons are also used
      // for as a proxy - getting back to where you are).
      zoomControl={false}
    >
      {/* CartoDB's light "Voyager" basemap - clean labels and muted colour,
          closer to a modern property-listing map than raw OSM tiles. Free,
          no API key, built on OpenStreetMap data. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      <NotifyOnDrag onDragStart={onMapDragStart} />

      <DrawCanvas
        active={mode === 'draw' && drawingActive}
        resumeFrom={resumeFrom}
        onRouteComplete={onRouteComplete}
      />

      {mode === 'draw' && drawnPoints.length > 1 && (
        <Polyline
          positions={drawnPoints}
          pathOptions={{ color: '#f97316', weight: 5, lineCap: 'round', lineJoin: 'round' }}
        />
      )}

      {/* Where the next stroke picks up, so it is clear where to carry on. */}
      {mode === 'draw' && resumeFrom && (
        <CircleMarker
          center={resumeFrom}
          radius={7}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#f97316', fillOpacity: 1 }}
        />
      )}

      {mode === 'find' && userPosition && (
        <>
          <RecenterOnPosition position={userPosition} />
          <Marker position={userPosition}>
            <Popup>You are here</Popup>
          </Marker>
        </>
      )}

      {mode === 'find' && route && (
        <Polyline
          positions={route.points}
          pathOptions={{
            color: '#2563eb',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
    </MapContainer>
  );
}
