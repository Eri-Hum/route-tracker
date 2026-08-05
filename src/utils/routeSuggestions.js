import { generateLoopRoute, resamplePath, overlapRatio, excessTurnPerKm } from './geo';
import { fetchElevations, elevationGain } from './elevation';
import { planRoadLoop } from './routing';

// How many waypoints a loop uses, and how much its shape wanders, come from
// the activity - a bike wants fewer, straighter legs than a run.
const MIN_WAYPOINTS = 3;
// A waypoint that had to be snapped further than this to reach the network
// landed somewhere unroutable (inside a block, across a railway, in water).
// Visiting it means detouring in and back out, so it gets dropped.
const MAX_SNAP_DISTANCE_M = 120;

const ELEVATION_SAMPLE_POINTS = 20;
// Independent shapes tried per suggestion; the best-scoring one is kept.
const CANDIDATES_PER_SUGGESTION = 2;
// Waypoints for consecutive suggestions are spread using the golden angle,
// which gives good, non-repeating coverage around the circle indefinitely.
const GOLDEN_ANGLE_DEG = 137.5;
const SHAPE_VARIANTS = [0, 0.5, -0.5];

// How close the routed distance has to get to what was asked for.
const DISTANCE_TOLERANCE_KM = 0.2;
// Routing calls are throttled to 1/sec, so each extra step costs about a
// second of waiting. The search exits the moment it is inside tolerance and
// usually needs a step or two, so this ceiling is only ever reached by the
// awkward cases - typically long rides, where a fixed 200 m is a very tight
// fraction of the total.
const MAX_REFINEMENT_STEPS = 9;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
// When the search runs out of room between its own measurements, rotating
// the loop a little puts a different set of streets under it and gives the
// search somewhere new to go.
const MAX_SHAPE_NUDGES = 2;
const SHAPE_NUDGE_DEG = 25;

// Doubling back is the thing that makes a generated route unpleasant, so it
// dominates the score; distance accuracy and terrain fit are tie-breakers.
const OVERLAP_WEIGHT = 3;
const TERRAIN_WEIGHT = 0.5;
// Turning this much past a loop's unavoidable 360 degrees, per km, counts as
// a thoroughly wiggly route. Used to bring excess turning onto the same
// 0-1ish scale as the other scoring terms.
const WIGGLY_TURN_PER_KM = 200;

function estimateMinutes(distanceKm, gainM, activity) {
  return distanceKm * activity.paceMinPerKm + gainM * activity.ascentMinPerM;
}

function gainPerKm(gainM, distanceKm) {
  return distanceKm > 0 ? gainM / distanceKm : 0;
}

function classify(gainM, distanceKm, activity) {
  return gainPerKm(gainM, distanceKm) < activity.hillyGainPerKm ? 'flat' : 'hilly';
}

// Waypoints the router could only reach by leaving the network are the ones
// that force in-and-out spurs. Returns a reduced waypoint list, or null if
// there is nothing worth dropping.
function pruneUnroutableWaypoints(waypoints, snapDistances) {
  if (snapDistances.length !== waypoints.length) return null;

  const kept = waypoints.filter((_, i) => {
    // Never drop the start/end - the loop is anchored there.
    if (i === 0 || i === waypoints.length - 1) return true;
    return snapDistances[i] <= MAX_SNAP_DISTANCE_M;
  });

  if (kept.length === waypoints.length || kept.length < MIN_WAYPOINTS) return null;
  return kept;
}

// Route one skeleton. When `allowPrune` is set, retry without any waypoints
// that turned out to be unroutable - worth one extra call while choosing a
// shape, but skipped during distance tuning where the shape is already
// settled and only its radius is moving.
//
// Deliberately has no offline fallback. Returning the raw geometric loop
// when routing is unavailable would hand back straight lines between
// waypoints - a "route" cutting across motorways, railways and water, shown
// with a distance and a climb as though someone could run it. A failure
// here has to surface as a failure.
async function planCandidate(waypoints, activity, allowPrune) {
  const plan = await planRoadLoop(waypoints, activity);
  if (!allowPrune) return plan;

  const pruned = pruneUnroutableWaypoints(waypoints, plan.snapDistances);
  if (!pruned) return plan;
  try {
    return await planRoadLoop(pruned, activity);
  } catch {
    return plan;
  }
}

function shapeForSlot(slot) {
  return {
    rotation: (slot * GOLDEN_ANGLE_DEG) % 360,
    shape: SHAPE_VARIANTS[slot % SHAPE_VARIANTS.length],
  };
}

// Waypoints for a loop meant to come out at `targetKm` once routed, at
// `scale` times that size. The ring is laid out smaller than the target by
// the activity's typical detour, so scale 1 is already a fair guess rather
// than a guaranteed overshoot.
function skeletonFor(start, targetKm, scale, rotation, shape, activity) {
  return generateLoopRoute(
    start,
    (targetKm * scale) / activity.typicalDetour,
    rotation,
    shape * activity.wobbleAmplitude,
    activity.waypoints
  );
}

function scoreOf(route, targetKm, terrain, activity) {
  const distanceError = Math.abs(route.distanceKm - targetKm) / targetKm;

  let terrainPenalty = 0;
  if (terrain !== 'any') {
    const steepness = gainPerKm(route.elevationGainM, route.distanceKm);
    // Reward ascent for "hilly", punish it for "flat", on a 0-1ish scale.
    const normalized = Math.min(steepness / 20, 1);
    terrainPenalty = terrain === 'flat' ? normalized : 1 - normalized;
  }

  // Constant direction changes make for a tiring ride and a scrappy run.
  const turnPenalty = Math.min(route.excessTurn / WIGGLY_TURN_PER_KM, 1);

  // The profile's own travel time gives away ground it considers slow
  // going: on a bike that is footways and steps, where the rider is pushing
  // rather than riding.
  const speedKph = route.durationH > 0 ? route.distanceKm / route.durationH : Infinity;
  const pushPenalty = Math.max(0, 1 - speedKph / activity.cruisingSpeedKph);

  return (
    route.overlap * OVERLAP_WEIGHT +
    distanceError +
    terrainPenalty * TERRAIN_WEIGHT +
    turnPenalty * activity.straightnessWeight +
    pushPenalty * activity.pushingWeight
  );
}

// Next radius scale to try, treating "routed distance as a function of the
// radius we asked for" as a root-finding problem.
//
// Once we have measurements on both sides of the target we interpolate
// strictly *inside* that bracket, falling back to bisection whenever
// interpolation would leave it or land somewhere already measured. Road
// snapping makes the function lumpy and non-monotonic, so an unconstrained
// secant step can extrapolate wildly when both nearest samples happen to
// sit on the same side; staying inside a known bracket cannot. Before a
// bracket exists there is nothing to interpolate between, so we take a
// proportional guess from the closest measurement.
//
// Returns null when there is nothing new left to try.
function nextScale(samples, target) {
  const closestBelow = samples
    .filter((s) => s.distanceKm > 0 && s.distanceKm <= target)
    .sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const closestAbove = samples
    .filter((s) => s.distanceKm > target)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  let scale;
  if (closestBelow && closestAbove) {
    const lo = Math.min(closestBelow.scale, closestAbove.scale);
    const hi = Math.max(closestBelow.scale, closestAbove.scale);
    const spread = closestAbove.distanceKm - closestBelow.distanceKm;

    scale =
      spread < 1e-6
        ? (lo + hi) / 2
        : closestBelow.scale +
          ((target - closestBelow.distanceKm) * (closestAbove.scale - closestBelow.scale)) / spread;

    const alreadyTried = (s) => samples.some((seen) => Math.abs(seen.scale - s) < 0.005);
    if (!(scale > lo && scale < hi) || alreadyTried(scale)) scale = (lo + hi) / 2;
    if (alreadyTried(scale)) return null;
  } else {
    const nearest = [...samples]
      .filter((s) => s.distanceKm > 0)
      .sort((a, b) => Math.abs(a.distanceKm - target) - Math.abs(b.distanceKm - target))[0];
    if (!nearest) return null;
    scale = nearest.scale * (target / nearest.distanceKm);
    if (samples.some((s) => Math.abs(s.scale - scale) < 0.01)) return null;
  }

  if (!Number.isFinite(scale)) return null;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

// Keep adjusting the loop's radius until its routed distance lands within
// tolerance of what was asked for, returning the closest attempt.
async function tuneDistance(start, target, winner, activity) {
  const { shape } = winner;
  let rotation = winner.rotation;
  let samples = [{ scale: 1, distanceKm: winner.distanceKm }];
  let best = winner;
  // Radius that produced the best result so far, used to resume from the
  // most promising size after a rotation change.
  let bestScale = 1;
  let nudges = 0;

  for (let step = 0; step < MAX_REFINEMENT_STEPS; step++) {
    if (Math.abs(best.distanceKm - target) <= DISTANCE_TOLERANCE_KM) break;

    let scale = samples.length > 0 ? nextScale(samples, target) : bestScale;
    let stalled = scale === null;

    if (stalled) {
      if (nudges >= MAX_SHAPE_NUDGES) break;
      scale = bestScale;
    }

    let plan;
    try {
      plan = await planCandidate(
        skeletonFor(start, target, scale, rotation, shape, activity),
        activity,
        false
      );
    } catch {
      // Tuning is an improvement on an already-valid route, so a failed
      // step just ends the search rather than losing what we have.
      break;
    }

    // A measurement that lands on a distance we have already seen means the
    // network is stepping straight over the target at this orientation:
    // shrinking the radius further just returns the same few loops.
    if (samples.some((s) => Math.abs(s.distanceKm - plan.distanceKm) < 0.01)) stalled = true;

    samples.push({ scale, distanceKm: plan.distanceKm });
    if (Math.abs(plan.distanceKm - target) < Math.abs(best.distanceKm - target)) {
      best = { ...plan, rotation, shape };
      bestScale = scale;
    }

    // Rotating the loop puts a different set of streets under it, which
    // gives the search somewhere new to go instead of stopping short.
    if (stalled && nudges < MAX_SHAPE_NUDGES) {
      nudges++;
      rotation = (rotation + SHAPE_NUDGE_DEG) % 360;
      samples = [];
    }
  }
  return best;
}

// Attach geometry- and elevation-derived stats to routes, using a single
// batched elevation request for all of them.
async function withStats(routes, activity) {
  const samples = routes.map((r) => resamplePath(r.points, ELEVATION_SAMPLE_POINTS));
  const flat = await fetchElevations(samples.flat());

  return routes.map((route, i) => {
    const elevations = flat.slice(i * ELEVATION_SAMPLE_POINTS, (i + 1) * ELEVATION_SAMPLE_POINTS);
    const gainM = elevationGain(elevations);
    return {
      ...route,
      overlap: overlapRatio(route.points),
      excessTurn: excessTurnPerKm(route.points),
      elevationGainM: gainM,
      estimatedMinutes: estimateMinutes(route.distanceKm, gainM, activity),
      terrain: classify(gainM, route.distanceKm, activity),
    };
  });
}

// Generates the `index`-th suggestion for this search (0-based). Each index
// gets its own rotations via the golden angle, so repeated calls with
// increasing indexes produce an effectively unlimited stream of varied
// routes rather than cycling a fixed pool.
export async function generateRouteSuggestion(start, distanceKm, terrain, index, activity) {
  // Route a few candidate shapes, then compare them on one batched
  // elevation lookup so terrain preference can influence the choice.
  const candidates = [];
  let failure = null;
  for (let i = 0; i < CANDIDATES_PER_SUGGESTION; i++) {
    const { rotation, shape } = shapeForSlot(index * CANDIDATES_PER_SUGGESTION + i);
    try {
      const plan = await planCandidate(
        skeletonFor(start, distanceKm, 1, rotation, shape, activity),
        activity,
        true
      );
      candidates.push({ ...plan, rotation, shape });
    } catch (err) {
      failure = err;
    }
  }
  // One shape failing is survivable; none of them routing is not. Better to
  // report that than to invent a route nobody can actually travel.
  if (candidates.length === 0) {
    throw failure ?? new Error('Could not plan a route from here.');
  }

  const scored = await withStats(candidates, activity);
  const winner = scored.reduce((a, b) =>
    scoreOf(a, distanceKm, terrain, activity) <= scoreOf(b, distanceKm, terrain, activity) ? a : b
  );

  // Then home in on the requested distance with that shape.
  const tuned = await tuneDistance(start, distanceKm, winner, activity);
  const final = tuned === winner ? winner : (await withStats([tuned], activity))[0];

  return {
    id: `route-${index}`,
    points: final.points,
    distanceKm: final.distanceKm,
    elevationGainM: final.elevationGainM,
    estimatedMinutes: final.estimatedMinutes,
    terrain: final.terrain,
    // True when the road network simply had no loop this close to the
    // requested distance, so the UI can be honest about it.
    offTarget: Math.abs(final.distanceKm - distanceKm) > DISTANCE_TOLERANCE_KM,
  };
}
