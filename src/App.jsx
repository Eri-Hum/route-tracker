import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import { generateRouteSuggestion } from './utils/routeSuggestions';
import { getActivity, DEFAULT_ACTIVITY } from './utils/activities';
import { pathDistance } from './utils/haversine';
import { resamplePath } from './utils/geo';
import { fetchElevations, elevationGain } from './utils/elevation';
import './App.css';

const DEFAULT_DISTANCE_KM = 5;
// Soft cap on how many suggestions a single search can generate, mostly to
// avoid hammering the free routing/elevation APIs from one session.
const MAX_SUGGESTIONS = 12;
// Same sample count Find mode uses for its own elevation lookups.
const DRAWN_ELEVATION_SAMPLES = 20;
// Wait for drawing to actually pause before asking OpenTopoData anything -
// each stroke, undo, or clear would otherwise fire its own request.
const DRAWN_ELEVATION_DEBOUNCE_MS = 500;

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

  // The sheet sizes itself to whatever it's actually showing (see
  // .sheet's height:auto), rather than claiming a fixed slice of the
  // screen regardless of content - Draw mode's handful of controls don't
  // need Find mode's share of it. The FABs float just above the sheet, so
  // they need to know its real height too; this mirrors that measured
  // value into --panel-size (read by the FABs' CSS) instead of guessing
  // at it, so they track wherever the sheet's edge actually ends up.
  const appRef = useRef(null);
  const sheetRef = useRef(null);
  useEffect(() => {
    const appEl = appRef.current;
    const sheetEl = sheetRef.current;
    if (!appEl || !sheetEl) return;

    const observer = new ResizeObserver(([entry]) => {
      appEl.style.setProperty('--panel-size', `${entry.contentRect.height}px`);
    });
    observer.observe(sheetEl);
    return () => observer.disconnect();
  }, []);

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

  // Total climb along the drawn route, from the same elevation source Find
  // mode uses. Debounced so a burst of strokes/undos only fires one lookup
  // once things settle, and cancelled rather than raced if the route
  // changes again before a request comes back.
  const [drawnElevationGainM, setDrawnElevationGainM] = useState(null);
  const [drawnElevationLoading, setDrawnElevationLoading] = useState(false);
  const elevationRequestRef = useRef(0);

  useEffect(() => {
    if (drawnPoints.length < 2) {
      setDrawnElevationGainM(null);
      setDrawnElevationLoading(false);
      return;
    }

    const requestId = ++elevationRequestRef.current;
    setDrawnElevationLoading(true);

    const timer = setTimeout(async () => {
      try {
        const samples = resamplePath(drawnPoints, DRAWN_ELEVATION_SAMPLES);
        const elevations = await fetchElevations(samples);
        if (elevationRequestRef.current !== requestId) return; // superseded
        setDrawnElevationGainM(elevationGain(elevations));
      } catch {
        if (elevationRequestRef.current === requestId) setDrawnElevationGainM(null);
      } finally {
        if (elevationRequestRef.current === requestId) setDrawnElevationLoading(false);
      }
    }, DRAWN_ELEVATION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [drawnPoints]);

  // Each stroke is appended, so the route survives between strokes and can
  // be built up while panning and zooming in between. The pen switches off
  // afterwards so the map is immediately movable again, but the sheet stays
  // exactly as it was - opening it back up is left to the handle, not
  // something that happens on its own after every stroke.
  const handleRouteComplete = useCallback((latlngs) => {
    setDrawnSegments((prev) => [...prev, latlngs]);
    setPenActive(false);
  }, []);

  const handleClearDrawnRoute = () => setDrawnSegments([]);
  const handleUndoSegment = () => setDrawnSegments((prev) => prev.slice(0, -1));

  const handleTogglePen = () => {
    setPenActive((p) => {
      const next = !p;
      // Collapse the instant drawing starts, so the map is unobstructed;
      // stopping does not reopen it - same reasoning as above.
      if (next) setSheetCollapsed(true);
      return next;
    });
  };

  // Panning the map is the other case the sheet should get out of the way
  // for. A programmatic move (recentring on a fresh location fix) does not
  // fire Leaflet's drag events, so this only reacts to an actual touch/drag.
  const handleMapDragStart = useCallback(() => setSheetCollapsed(true), []);

  // The handle is the one deliberate control for the sheet itself: a tap
  // toggles whichever state it's in, a real drag is directional (pull down
  // to collapse, up to expand) - as opposed to it collapsing on its own
  // while drawing or panning.
  const handleToggleSheet = (action) => {
    if (action === 'collapse') setSheetCollapsed(true);
    else if (action === 'expand') setSheetCollapsed(false);
    else setSheetCollapsed((c) => !c);
  };

  const handleLocate = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolokalisering stöds inte av den här webbläsaren.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setGeoError('Kunde inte hämta din position.');
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
    } catch {
      setFindError('Det gick inte att hämta ruttdata.');
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

  // "New search" from the result view has to bring the input form back, not
  // just rerun the same search - otherwise there is no way to change the
  // distance/terrain/activity once a route is showing short of reloading.
  // Distance/terrain/activity themselves are left as they were, so tweaking
  // one and searching again doesn't mean re-entering everything.
  const handleResetSearch = () => {
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
    } catch {
      setFindError('Det gick inte att hämta ruttdata.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={appRef} className={`app ${sheetCollapsed ? 'sheet-collapsed' : ''}`}>
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
        <span className="brand">Ruttspårare</span>
        <div className="segmented segmented--topbar" role="group" aria-label="Läge">
          <button
            className={`segmented-option ${mode === 'draw' ? 'segmented-option--active' : ''}`}
            onClick={() => mode !== 'draw' && handleToggleMode()}
          >
            Rita
          </button>
          <button
            className={`segmented-option ${mode === 'find' ? 'segmented-option--active' : ''}`}
            onClick={() => mode !== 'find' && handleToggleMode()}
          >
            Hitta
          </button>
        </div>
      </header>

      {mode === 'draw' && (
        <button
          className={`fab fab--pencil ${penActive ? 'fab--active' : ''}`}
          onClick={handleTogglePen}
          aria-label={penActive ? 'Sluta rita' : 'Börja rita'}
          title={penActive ? 'Sluta rita' : 'Börja rita'}
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
          aria-label={userPosition ? 'Uppdatera min position' : 'Använd min position'}
          title={userPosition ? 'Uppdatera min position' : 'Använd min position'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {findError && <div className="toast toast-error">{findError}</div>}

      <div ref={sheetRef} className="sheet">
        <Sidebar
          mode={mode}
          onToggleSheet={handleToggleSheet}
          sheetCollapsed={sheetCollapsed}
          drawnDistanceKm={drawnDistanceKm}
          drawnElevationGainM={drawnElevationGainM}
          drawnElevationLoading={drawnElevationLoading}
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
          onResetSearch={handleResetSearch}
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
