import { useCallback, useState } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import { generateRouteSuggestion } from './utils/routeSuggestions';
import './App.css';

const DEFAULT_DISTANCE_KM = 5;
// Soft cap on how many suggestions a single search can generate, mostly to
// avoid hammering the free routing/elevation APIs from one session.
const MAX_SUGGESTIONS = 12;

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
  const [currentIndex, setCurrentIndex] = useState(-1);
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
    try {
      const first = await generateRouteSuggestion(userPosition, Number(distanceKm), terrain, 0);
      setSuggestions([first]);
      setCurrentIndex(0);
    } catch (err) {
      setFindError(err.message || 'Failed to fetch route data.');
      setSuggestions([]);
      setCurrentIndex(-1);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevSuggestion = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const handleNextSuggestion = async () => {
    if (currentIndex + 1 < suggestions.length) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    if (suggestions.length >= MAX_SUGGESTIONS) return;

    setLoading(true);
    setFindError(null);
    try {
      const next = await generateRouteSuggestion(
        userPosition,
        Number(distanceKm),
        terrain,
        suggestions.length
      );
      setSuggestions((prev) => [...prev, next]);
      setCurrentIndex(suggestions.length);
    } catch (err) {
      setFindError(err.message || 'Failed to fetch route data.');
    } finally {
      setLoading(false);
    }
  };

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
        currentIndex={currentIndex}
        onPrevSuggestion={handlePrevSuggestion}
        onNextSuggestion={handleNextSuggestion}
        maxSuggestions={MAX_SUGGESTIONS}
      />

      <main className="map-area">
        <MapView
          mode={mode}
          drawingActive={penActive}
          onRouteComplete={handleRouteComplete}
          drawnRoute={drawnRoute}
          userPosition={userPosition}
          route={currentIndex >= 0 ? suggestions[currentIndex] : null}
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
      </main>
    </div>
  );
}

export default App;
