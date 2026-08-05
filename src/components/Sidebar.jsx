import { useRef } from 'react';
import { ACTIVITIES } from '../utils/activities';

// Past this much vertical movement, a press on the handle counts as a drag
// (collapse by pulling down, expand by pulling up) rather than a tap
// (toggle whichever state it's currently in).
const HANDLE_DRAG_THRESHOLD = 30;

const TERRAIN_OPTIONS = [
  { id: 'any', label: "Doesn't matter" },
  { id: 'flat', label: 'Flat' },
  { id: 'hilly', label: 'Hilly' },
];

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`segmented-option ${value === opt.id ? 'segmented-option--active' : ''}`}
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
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
    hint = 'Move the map freely, then tap "Start drawing" to draw a route.';
  }

  return (
    <div className="sheet-section">
      {started && (
        <div className="stat-card">
          <div className="stat-card-headline">
            <span className="stat-big">{drawnDistanceKm.toFixed(2)}</span>
            <span className="stat-unit">km</span>
            <span className="stat-chip">{drawnSegmentCount} stroke{drawnSegmentCount === 1 ? '' : 's'}</span>
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
      )}

      <button className="btn btn-primary btn-large" onClick={onTogglePen}>
        {penActive ? (
          <>Stop drawing</>
        ) : (
          <>
            <PencilIcon />
            {started ? 'Continue drawing' : 'Start drawing'}
          </>
        )}
      </button>
      <p className="hint hint-center">{hint}</p>
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
    <div className="sheet-section">
      {!route && (
        <>
          <div className="field-group">
            <span className="field-label">Activity</span>
            <Segmented
              label="Activity"
              options={Object.values(ACTIVITIES).map((a) => ({ id: a.id, label: a.label }))}
              value={activityId}
              onChange={onActivityChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="distance-input">
              Desired distance
            </label>
            <div className="distance-input-wrap">
              <input
                id="distance-input"
                type="number"
                min="0.5"
                step="0.5"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
              <span className="distance-input-unit">km</span>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Terrain</span>
            <Segmented label="Terrain" options={TERRAIN_OPTIONS} value={terrain} onChange={setTerrain} />
          </div>

          <button
            className={`btn btn-secondary btn-pin ${userPosition ? 'btn-pin--set' : ''}`}
            onClick={onLocate}
          >
            <PinIcon />
            {userPosition
              ? `${userPosition[0].toFixed(3)}, ${userPosition[1].toFixed(3)}`
              : 'Use my location'}
          </button>
          {geoError && <p className="error-text">{geoError}</p>}

          <button
            className="btn btn-primary btn-large"
            onClick={onFindRoutes}
            disabled={!userPosition || loading}
          >
            {loading ? (
              <>
                <span className="spinner spinner--light" />
                Matching your distance…
              </>
            ) : (
              'Find routes'
            )}
          </button>
        </>
      )}

      {route && (
        <div className="route-result">
          <div className="route-nav-header">
            <button
              className="btn-icon"
              onClick={onPrevSuggestion}
              disabled={loading || currentIndex === 0}
              aria-label="Previous suggestion"
            >
              <ChevronIcon direction="left" />
            </button>
            <span className="hint">Route {currentIndex + 1}</span>
            <button
              className="btn-icon"
              onClick={onNextSuggestion}
              disabled={nextDisabled}
              aria-label="Next suggestion"
            >
              {loading ? <span className="spinner" /> : <ChevronIcon direction="right" />}
            </button>
          </div>

          <div className={`terrain-badge terrain-badge--${route.terrain}`}>{route.terrain}</div>

          <div className="stat-card">
            <div className="stat-card-headline">
              <span className="stat-big">{route.distanceKm.toFixed(2)}</span>
              <span className="stat-unit">km</span>
            </div>
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-tile-label">Elevation</span>
                <span className="stat-tile-value">{Math.round(route.elevationGainM)} m</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Est. time</span>
                <span className="stat-tile-value">{formatMinutes(route.estimatedMinutes)}</span>
              </div>
            </div>
            {route.offTarget && (
              <p className="hint hint-warn">
                Closest loop the streets around here allow — try Next for another.
              </p>
            )}
          </div>

          <button className="btn btn-secondary" onClick={onFindRoutes}>
            Start a new search
          </button>
        </div>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function ChevronIcon({ direction }) {
  const d = direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The handle is the one deliberate, dedicated control for showing or hiding
// the sheet - as opposed to it collapsing on its own while drawing or
// panning. A tap toggles whichever state it's in; a real drag is
// directional, like pulling a real bottom sheet open or push it shut.
//
// Pointer events (not a plain onClick) track the drag so mouse and touch
// share one code path. Click still fires afterwards - for the mouse/touch
// tap case *and* for keyboard activation, which never dispatches pointer
// events at all - so the actual state change happens there, once, reading
// whatever the pointer handlers most recently measured.
function SheetHandle({ onToggle }) {
  const startYRef = useRef(null);
  const dragDeltaRef = useRef(0);

  const handlePointerDown = (e) => {
    startYRef.current = e.clientY;
    dragDeltaRef.current = 0;
    // Without this, a drag that moves the pointer past the handle's small
    // hit area stops delivering pointermove (and the eventual pointerup)
    // to it - they'd go to whatever element is now under the pointer
    // instead. Capturing keeps them targeted here regardless of where the
    // pointer physically ends up.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (startYRef.current !== null) {
      dragDeltaRef.current = e.clientY - startYRef.current;
    }
  };
  const handlePointerUp = (e) => {
    startYRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const handleClick = () => {
    const delta = dragDeltaRef.current;
    dragDeltaRef.current = 0;
    if (Math.abs(delta) > HANDLE_DRAG_THRESHOLD) {
      onToggle(delta > 0 ? 'collapse' : 'expand');
    } else {
      onToggle('toggle');
    }
  };

  return (
    <button
      type="button"
      className="sheet-handle-row"
      aria-label="Show or hide panel"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <span className="sheet-handle-bar" aria-hidden="true" />
    </button>
  );
}

export default function Sidebar({ mode, onToggleSheet, ...props }) {
  return (
    <div className="sheet-content">
      <SheetHandle onToggle={onToggleSheet} />
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
    </div>
  );
}
