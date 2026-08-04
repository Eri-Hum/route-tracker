import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
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

export default function MapView({
  mode,
  drawingActive,
  onRouteComplete,
  drawnRoute,
  userPosition,
  route,
}) {
  return (
    <MapContainer
      center={userPosition || DEFAULT_CENTER}
      zoom={13}
      className="map-container"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <DrawCanvas active={mode === 'draw' && drawingActive} onRouteComplete={onRouteComplete} />

      {mode === 'draw' && drawnRoute && (
        <Polyline positions={drawnRoute.latlngs} pathOptions={{ color: '#e6402b', weight: 4 }} />
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
          pathOptions={{ color: '#2b7de6', weight: 5, opacity: 0.9 }}
        />
      )}
    </MapContainer>
  );
}
