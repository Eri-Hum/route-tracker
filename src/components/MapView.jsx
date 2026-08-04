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

const DEFAULT_CENTER = [51.505, -0.09];

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
  onRouteComplete,
  drawnRoute,
  userPosition,
  suggestions,
  selectedRouteId,
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

      <DrawCanvas active={mode === 'draw'} onRouteComplete={onRouteComplete} />

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

      {mode === 'find' &&
        suggestions.map((route) => {
          const isSelected = route.id === selectedRouteId;
          if (selectedRouteId && !isSelected) return null;
          return (
            <Polyline
              key={route.id}
              positions={route.points}
              pathOptions={{
                color: isSelected ? '#2b7de6' : '#9aa5b1',
                weight: isSelected ? 5 : 3,
                opacity: isSelected ? 0.9 : 0.6,
              }}
            />
          );
        })}
    </MapContainer>
  );
}
