import { generateLoopRoute, resamplePath, overlapRatio } from './geo';
import { pathDistance } from './haversine';
import { fetchElevations, elevationGain } from './elevation';
import { planRoadLoop } from './routing';

// Waypoints per candidate loop. Each one is a hard constraint the router
// must pass through, so a handful of well-spread points beats a dense ring:
// it leaves each leg free to be a natural shortest path.
const POINTS_PER_ROUTE = 5;
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

// Doubling back is the thing that makes a generated route unpleasant, so it
// dominates the score; distance accuracy and terrain fit are tie-breakers.
const OVERLAP_WEIGHT = 3;
const TERRAIN_WEIGHT = 0.5;

// Baseline running pace (min/km) plus Naismith-style penalty for ascent.
const BASE_PACE_MIN_PER_KM = 6;
const MIN_PER_M_ASCENT = 0.1;

function estimateMinutes(distanceKm, gainM) {
  return distanceKm * BASE_PACE_MIN_PER_KM + gainM * MIN_PER_M_ASCENT;
}

function gainPerKm(gainM, distanceKm) {
  return distanceKm > 0 ? gainM / distanceKm : 0;
}

function classify(gainM, distanceKm) {
  return gainPerKm(gainM, distanceKm) < 8 ? 'flat' : 'hilly';
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

// Route one skeleton, then retry without any waypoints that turned out to
// be unroutable. Falls back to the raw geometric loop if the routing
// service is unavailable.
async function planCandidate(waypoints) {
  let plan;
  try {
    plan = await planRoadLoop(waypoints);
  } catch {
    return { points: waypoints, distanceKm: pathDistance(waypoints) };
  }

  const pruned = pruneUnroutableWaypoints(waypoints, plan.snapDistances);
  if (pruned) {
    try {
      return await planRoadLoop(pruned);
    } catch {
      return plan;
    }
  }
  return plan;
}

function scoreOf(route, targetKm, terrain) {
  const distanceError = Math.abs(route.distanceKm - targetKm) / targetKm;
  let terrainPenalty = 0;
  if (terrain !== 'any') {
    const steepness = gainPerKm(route.elevationGainM, route.distanceKm);
    // Reward ascent for "hilly", punish it for "flat", on a 0-1ish scale.
    const normalized = Math.min(steepness / 20, 1);
    terrainPenalty = terrain === 'flat' ? normalized : 1 - normalized;
  }
  return (
    route.overlap * OVERLAP_WEIGHT + distanceError + terrainPenalty * TERRAIN_WEIGHT
  );
}

// Attach elevation-derived stats to several routes using a single batched
// elevation request.
async function withElevation(routes) {
  const samples = routes.map((r) => resamplePath(r.points, ELEVATION_SAMPLE_POINTS));
  const flat = await fetchElevations(samples.flat());

  return routes.map((route, i) => {
    const elevations = flat.slice(i * ELEVATION_SAMPLE_POINTS, (i + 1) * ELEVATION_SAMPLE_POINTS);
    const gainM = elevationGain(elevations);
    return {
      points: route.points,
      distanceKm: route.distanceKm,
      overlap: overlapRatio(route.points),
      elevationGainM: gainM,
      estimatedMinutes: estimateMinutes(route.distanceKm, gainM),
      terrain: classify(gainM, route.distanceKm),
    };
  });
}

// Generates the `index`-th suggestion for this search (0-based). Each index
// gets its own rotations via the golden angle, so repeated calls with
// increasing indexes produce an effectively unlimited stream of varied
// routes rather than cycling a fixed pool.
export async function generateRouteSuggestion(start, distanceKm, terrain, index) {
  const skeletons = [];
  for (let i = 0; i < CANDIDATES_PER_SUGGESTION; i++) {
    const slot = index * CANDIDATES_PER_SUGGESTION + i;
    skeletons.push(
      generateLoopRoute(
        start,
        distanceKm,
        (slot * GOLDEN_ANGLE_DEG) % 360,
        SHAPE_VARIANTS[slot % SHAPE_VARIANTS.length],
        POINTS_PER_ROUTE
      )
    );
  }

  const planned = [];
  for (const skeleton of skeletons) {
    planned.push(await planCandidate(skeleton));
  }

  const scored = await withElevation(planned);
  let best = scored.reduce((a, b) =>
    scoreOf(a, distanceKm, terrain) <= scoreOf(b, distanceKm, terrain) ? a : b
  );

  // Loop length scales roughly linearly with radius, so if the winner is
  // well off target, one rescaled retry usually lands much closer.
  const bestIdx = scored.indexOf(best);
  const error = Math.abs(best.distanceKm - distanceKm) / distanceKm;
  if (error > 0.08 && best.distanceKm > 0) {
    const slot = index * CANDIDATES_PER_SUGGESTION + bestIdx;
    const retry = await planCandidate(
      generateLoopRoute(
        start,
        distanceKm * (distanceKm / best.distanceKm),
        (slot * GOLDEN_ANGLE_DEG) % 360,
        SHAPE_VARIANTS[slot % SHAPE_VARIANTS.length],
        POINTS_PER_ROUTE
      )
    );
    const [corrected] = await withElevation([retry]);
    if (scoreOf(corrected, distanceKm, terrain) < scoreOf(best, distanceKm, terrain)) {
      best = corrected;
    }
  }

  return { id: `route-${index}`, ...best };
}
