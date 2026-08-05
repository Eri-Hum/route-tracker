import { useCallback, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import { generateRouteSuggestion } from './utils/routeSuggestions';
import { getActivity, DEFAULT_ACTIVITY } from './utils/activities';
import { pathDistance } from './utils/haversine';
import './App.css';

const DEFAULT_DISTANCE_KM = 5;
// Soft cap on how many suggestions a single search can generate, mostly to
// avoid hammering the free routing/elevation APIs from one session.
const MAX_SUGGESTIONS = 12;

function App() {
  const [mode, setMode] = useState('draw');

  // Draw mode state. Strokes are kept separately rather than as one flat
  // path so the last one can be taken back - drawing a route in stages is
  // no use if a slip means starting over.
  const [drawnSegments, setDrawnSegments] = useState([]);
  const [penActive, setPenActive] = useState(false);

  // The sheet gets in the way of the one thing it sits on top of, so it
  // collapses to a small handle while the map is actually being used -
  // drawing, or just panning around - and only a deliberate tap brings it
  // back rather than reappearing on its own.
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  // Find mode state
  const [userPosition, setUserPosition] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [distanceKm, setDistanceKm] = useState(DEFAULT_DISTANCE_KM);
  const [terrain, setTerrain] = useState('any');
  const [activityId, setActivityId] = useState(DEFAULT_ACTIVITY);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [findError, setFindError] = useState(null);

  const handleToggleMode = () => {
    setPenActive(false);
    // Switching modes from the topbar is a deliberate request to see that
    // mode's controls, so it always brings the sheet back.
    setSheetCollapsed(false);
    setMode((m) => (m === 'draw' ? 'find' : 'draw'));
  };

  // The whole route so far, and where a new stroke would carry on from.
  const drawnPoints = useMemo(() => drawnSegments.flat(), [drawnSegments]);
  const drawnDistanceKm = useMemo(() => pathDistance(drawnPoints), [drawnPoints]);
  const resumeFrom = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;

  // Each stroke is appended, so the route survives between strokes and can
  // be built up while panning and zooming in between. The pen switches off
  // afterwards so the map is immediately movable again.
  const handleRouteComplete = useCallback((latlngs) => {
    setDrawnSegments((prev) => [...prev, latlngs]);
    setPenActive(false);
    // Bring the sheet back so the updated distance is visible immediately.
    setSheetCollapsed(false);
  }, []);

  const handleClearDrawnRoute = () => setDrawnSegments([]);
  const handleUndoSegment = () => setDrawnSegments((prev) => prev.slice(0, -1));

  const handleTogglePen = () => {
    setPenActive((p) => {
      const next = !p;
      // Collapse the instant drawing starts so the map is unobstructed;
      // bring the sheet back the instant it stops.
      setSheetCollapsed(next);
      return next;
    });
  };

  // Panning the map is the other case the sheet should get out of the way
  // for. A programmatic move (recentring on a fresh location fix) does not
  // fire Leaflet's drag events, so this only reacts to an actual touch/drag.
  const handleMapDragStart = useCallback(() => setSheetCollapsed(true), []);
  const handleExpandSheet = () => setSheetCollapsed(false);

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
      const first = await generateRouteSuggestion(
        userPosition,
        Number(distanceKm),
        terrain,
        0,
        getActivity(activityId)
      );
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

  // Suggestions are tied to the profile that produced them - a walking loop
  // is not a bike route - so switching activity clears them rather than
  // leaving stale ones on the map.
  const handleActivityChange = (id) => {
    setActivityId(id);
    setSuggestions([]);
    setCurrentIndex(-1);
    setFindError(null);
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
        suggestions.length,
        getActivity(activityId)
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
    <div className={`app ${sheetCollapsed ? 'sheet-collapsed' : ''}`}>
      <MapView
        mode={mode}
        drawingActive={penActive}
        onRouteComplete={handleRouteComplete}
        onMapDragStart={handleMapDragStart}
        drawnPoints={drawnPoints}
        resumeFrom={resumeFrom}
        userPosition={userPosition}
        route={currentIndex >= 0 ? suggestions[currentIndex] : null}
      />

      <header className="topbar">
        <span className="brand">Route Tracker</span>
        <div className="segmented segmented--topbar" role="group" aria-label="Mode">
          <button
            className={`segmented-option ${mode === 'draw' ? 'segmented-option--active' : ''}`}
            onClick={() => mode !== 'draw' && handleToggleMode()}
          >
            Draw
          </button>
          <button
            className={`segmented-option ${mode === 'find' ? 'segmented-option--active' : ''}`}
            onClick={() => mode !== 'find' && handleToggleMode()}
          >
            Find
          </button>
        </div>
      </header>

      {mode === 'draw' && (
        <button
          className={`fab fab--pencil ${penActive ? 'fab--active' : ''}`}
          onClick={handleTogglePen}
          aria-label={penActive ? 'Stop drawing' : 'Start drawing'}
          title={penActive ? 'Stop drawing' : 'Start drawing'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" strokeLinecap="round" />
            <path
              d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {mode === 'find' && (
        <button
          className="fab fab--locate"
          onClick={handleLocate}
          aria-label={userPosition ? 'Update my location' : 'Use my location'}
          title={userPosition ? 'Update my location' : 'Use my location'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {findError && <div className="toast toast-error">{findError}</div>}

      <div
        className="sheet"
        onClick={sheetCollapsed ? handleExpandSheet : undefined}
        role={sheetCollapsed ? 'button' : undefined}
        tabIndex={sheetCollapsed ? 0 : undefined}
        aria-label={sheetCollapsed ? 'Show controls' : undefined}
        onKeyDown={
          sheetCollapsed
            ? (e) => (e.key === 'Enter' || e.key === ' ') && handleExpandSheet()
            : undefined
        }
      >
        <Sidebar
          mode={mode}
          drawnDistanceKm={drawnDistanceKm}
          drawnSegmentCount={drawnSegments.length}
          onClearDrawnRoute={handleClearDrawnRoute}
          onUndoSegment={handleUndoSegment}
          penActive={penActive}
          onTogglePen={handleTogglePen}
          userPosition={userPosition}
          geoError={geoError}
          onLocate={handleLocate}
          distanceKm={distanceKm}
          setDistanceKm={setDistanceKm}
          terrain={terrain}
          setTerrain={setTerrain}
          activityId={activityId}
          onActivityChange={handleActivityChange}
          onFindRoutes={handleFindRoutes}
          loading={loading}
          suggestions={suggestions}
          currentIndex={currentIndex}
          onPrevSuggestion={handlePrevSuggestion}
          onNextSuggestion={handleNextSuggestion}
          maxSuggestions={MAX_SUGGESTIONS}
        />
      </div>
    </div>
  );
}

export default App;
