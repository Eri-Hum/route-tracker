import { ACTIVITIES } from '../utils/activities';

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function DrawModeControls({
  drawnDistanceKm,
  drawnSegmentCount,
  onClear,
  onUndoSegment,
  penActive,
  onTogglePen,
}) {
  const started = drawnSegmentCount > 0;

  let hint;
  if (penActive) {
    hint = started
      ? 'Draw on from the marked point. The map holds still until you stop.'
      : 'Press and drag on the map to draw a path freehand.';
  } else if (started) {
    hint = 'Move and zoom the map freely, then draw again to carry on from the marker.';
  } else {
    hint = 'Move the map freely, then click "Start drawing" to draw a route.';
  }

  return (
    <div className="sidebar-section">
      <h2>Draw Route</h2>
      <button className="btn btn-primary" onClick={onTogglePen}>
        {penActive ? 'Stop drawing' : started ? 'Continue drawing' : 'Start drawing'}
      </button>
      <p className="hint">{hint}</p>

      {started ? (
        <div className="stat-card">
          <div className="stat-row">
            <span>Distance</span>
            <strong>{drawnDistanceKm.toFixed(2)} km</strong>
          </div>
          <div className="stat-row">
            <span>Strokes</span>
            <strong>{drawnSegmentCount}</strong>
          </div>
          <div className="button-row">
            <button className="btn btn-secondary" onClick={onUndoSegment}>
              Undo stroke
            </button>
            <button className="btn btn-secondary" onClick={onClear}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <p className="hint">No route drawn yet.</p>
      )}
    </div>
  );
}

function FindModeControls({
  userPosition,
  geoError,
  onLocate,
  distanceKm,
  setDistanceKm,
  terrain,
  setTerrain,
  activityId,
  onActivityChange,
  onFindRoutes,
  loading,
  suggestions,
  currentIndex,
  onPrevSuggestion,
  onNextSuggestion,
  maxSuggestions,
}) {
  const route = currentIndex >= 0 ? suggestions[currentIndex] : null;
  const atLastGenerated = currentIndex === suggestions.length - 1;
  const nextDisabled = loading || (atLastGenerated && suggestions.length >= maxSuggestions);
  return (
    <div className="sidebar-section">
      <h2>Find Route</h2>

      <button className="btn btn-secondary" onClick={onLocate}>
        {userPosition ? 'Update my location' : 'Use my location'}
      </button>
      {geoError && <p className="error-text">{geoError}</p>}
      {userPosition && (
        <p className="hint">
          Location: {userPosition[0].toFixed(4)}, {userPosition[1].toFixed(4)}
        </p>
      )}

      <span className="field-label">Activity</span>
      <div className="segmented" role="group" aria-label="Activity">
        {Object.values(ACTIVITIES).map((activity) => (
          <button
            key={activity.id}
            type="button"
            className={`segmented-option ${
              activityId === activity.id ? 'segmented-option--active' : ''
            }`}
            aria-pressed={activityId === activity.id}
            onClick={() => onActivityChange(activity.id)}
          >
            {activity.label}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="distance-input">
        Desired distance (km)
      </label>
      <input
        id="distance-input"
        type="number"
        min="0.5"
        step="0.5"
        value={distanceKm}
        onChange={(e) => setDistanceKm(e.target.value)}
      />

      <label className="field-label" htmlFor="terrain-select">
        Terrain
      </label>
      <select
        id="terrain-select"
        value={terrain}
        onChange={(e) => setTerrain(e.target.value)}
      >
        <option value="any">Doesn't matter</option>
        <option value="flat">Flat</option>
        <option value="hilly">Hilly</option>
      </select>

      <button
        className="btn btn-primary"
        onClick={onFindRoutes}
        disabled={!userPosition || loading}
      >
        {loading ? 'Finding routes…' : 'Find Routes'}
      </button>

      {loading && (
        <div className="loading-indicator">
          <span className="spinner" />
          {route ? 'Finding another route…' : 'Matching your distance…'}
        </div>
      )}

      {route && (
        <div className="route-nav">
          <div className="route-nav-header">
            <button
              className="btn btn-secondary"
              onClick={onPrevSuggestion}
              disabled={loading || currentIndex === 0}
            >
              Prev
            </button>
            <span className="hint">Route {currentIndex + 1}</span>
            <button className="btn btn-secondary" onClick={onNextSuggestion} disabled={nextDisabled}>
              Next
            </button>
          </div>
          <div className="route-card route-card--selected">
            <div className="route-card-title">{route.terrain}</div>
            <div className="stat-row">
              <span>Distance</span>
              <strong>{route.distanceKm.toFixed(2)} km</strong>
            </div>
            <div className="stat-row">
              <span>Elevation gain</span>
              <strong>{Math.round(route.elevationGainM)} m</strong>
            </div>
            <div className="stat-row">
              <span>Est. time</span>
              <strong>{formatMinutes(route.estimatedMinutes)}</strong>
            </div>
            {route.offTarget && (
              <p className="hint">
                Closest loop the streets around here allow — try Next for another.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ mode, onToggleMode, ...props }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Route Tracker</h1>
        <button className="btn btn-toggle" onClick={onToggleMode}>
          Switch to {mode === 'draw' ? 'Find Route' : 'Draw Route'}
        </button>
      </div>

      {mode === 'draw' ? (
        <DrawModeControls
          drawnDistanceKm={props.drawnDistanceKm}
          drawnSegmentCount={props.drawnSegmentCount}
          onClear={props.onClearDrawnRoute}
          onUndoSegment={props.onUndoSegment}
          penActive={props.penActive}
          onTogglePen={props.onTogglePen}
        />
      ) : (
        <FindModeControls {...props} />
      )}
    </aside>
  );
}
