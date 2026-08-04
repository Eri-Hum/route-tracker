import { useCallback, useState } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import ElevationChart from './components/ElevationChart';
import { findRouteSuggestions } from './utils/routeSuggestions';
import './App.css';

const DEFAULT_DISTANCE_KM = 5;

function App() {
  const [mode, setMode] = useState('draw');

  // Draw mode state
  const [drawnRoute, setDrawnRoute] = useState(null);
  const [penActive, setPenActive] = useState(false);

  // Find mode state
  const [userPosition, setUserPosition] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [distanceKm, setDistanceKm] = useState(DEFAULT_DISTANCE_KM);
  const [terrain, setTerrain] = useState('any');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [findError, setFindError] = useState(null);

  const handleToggleMode = () => {
    setPenActive(false);
    setMode((m) => (m === 'draw' ? 'find' : 'draw'));
  };

  const handleRouteComplete = useCallback((latlngs, distanceKmValue) => {
    setDrawnRoute({ latlngs, distanceKm: distanceKmValue });
    setPenActive(false);
  }, []);

  const handleClearDrawnRoute = () => setDrawnRoute(null);

  const handleTogglePen = () => {
    if (!penActive) setDrawnRoute(null);
    setPenActive((p) => !p);
  };

  const handleLocate = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        setGeoError(err.message || 'Unable to retrieve your location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFindRoutes = async () => {
    if (!userPosition) return;
    setLoading(true);
    setFindError(null);
    setSelectedRouteId(null);
    try {
      const results = await findRouteSuggestions(
        userPosition,
        Number(distanceKm),
        terrain
      );
      setSuggestions(results);
      if (results.length > 0) setSelectedRouteId(results[0].id);
    } catch (err) {
      setFindError(err.message || 'Failed to fetch elevation data.');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const selectedRoute = suggestions.find((r) => r.id === selectedRouteId);

  return (
    <div className="app">
      <Sidebar
        mode={mode}
        onToggleMode={handleToggleMode}
        drawnRoute={drawnRoute}
        onClearDrawnRoute={handleClearDrawnRoute}
        penActive={penActive}
        onTogglePen={handleTogglePen}
        userPosition={userPosition}
        geoError={geoError}
        onLocate={handleLocate}
        distanceKm={distanceKm}
        setDistanceKm={setDistanceKm}
        terrain={terrain}
        setTerrain={setTerrain}
        onFindRoutes={handleFindRoutes}
        loading={loading}
        suggestions={suggestions}
        selectedRouteId={selectedRouteId}
        setSelectedRouteId={setSelectedRouteId}
      />

      <main className="map-area">
        <MapView
          mode={mode}
          drawingActive={penActive}
          onRouteComplete={handleRouteComplete}
          drawnRoute={drawnRoute}
          userPosition={userPosition}
          suggestions={suggestions}
          selectedRouteId={selectedRouteId}
        />
        {mode === 'draw' && (
          <button
            className={`pen-toggle-btn ${penActive ? 'pen-toggle-btn--active' : ''}`}
            onClick={handleTogglePen}
            aria-label={penActive ? 'Stop drawing' : 'Start drawing'}
            title={penActive ? 'Stop drawing' : 'Start drawing'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" strokeLinecap="round" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {findError && <div className="toast toast-error">{findError}</div>}
        {mode === 'find' && selectedRoute && <ElevationChart route={selectedRoute} />}
      </main>
    </div>
  );
}

export default App;
