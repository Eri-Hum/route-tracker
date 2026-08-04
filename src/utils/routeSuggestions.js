import { generateLoopRoute, resamplePath } from './geo';
import { pathDistance } from './haversine';
import { fetchElevations, elevationGain } from './elevation';
import { snapRouteToRoads } from './routing';

const POINTS_PER_ROUTE = 20;
const ELEVATION_SAMPLE_POINTS = 20;
// Rotation + shape variant per candidate so the 3 suggestions look distinct.
const CANDIDATES = [
  { rotation: 0, shape: 0 },
  { rotation: 130, shape: 1 },
  { rotation: 250, shape: -1 },
];

// Baseline running pace (min/km) plus Naismith-style penalty for ascent.
const BASE_PACE_MIN_PER_KM = 6;
const MIN_PER_M_ASCENT = 0.1;

function estimateMinutes(distanceKm, gainM) {
  return distanceKm * BASE_PACE_MIN_PER_KM + gainM * MIN_PER_M_ASCENT;
}

function classify(gainM, distanceKm) {
  const gainPerKm = distanceKm > 0 ? gainM / distanceKm : 0;
  return gainPerKm < 8 ? 'flat' : 'hilly';
}

// Snap a candidate loop onto the real road/path network. Falls back to the
// raw geometric loop if the routing service is unavailable, so a single
// failed request doesn't sink the whole suggestion set.
async function snapCandidate(points) {
  try {
    return await snapRouteToRoads(points);
  } catch {
    return { points, distanceKm: pathDistance(points) };
  }
}

export async function findRouteSuggestions(start, distanceKm, terrain) {
  const candidateRoutes = CANDIDATES.map((c) =>
    generateLoopRoute(start, distanceKm, c.rotation, c.shape, POINTS_PER_ROUTE)
  );

  const snapped = await Promise.all(candidateRoutes.map(snapCandidate));

  // Resample each road-following route down to a consistent point count
  // before batching elevation lookups.
  const elevationSamples = snapped.map((r) => resamplePath(r.points, ELEVATION_SAMPLE_POINTS));
  const flatElevations = await fetchElevations(elevationSamples.flat());

  let cursor = 0;
  const suggestions = snapped.map((route, idx) => {
    const elevations = flatElevations.slice(cursor, cursor + ELEVATION_SAMPLE_POINTS);
    cursor += ELEVATION_SAMPLE_POINTS;

    const gainM = elevationGain(elevations);
    const terrainType = classify(gainM, route.distanceKm);

    return {
      id: `route-${idx}`,
      points: route.points,
      distanceKm: route.distanceKm,
      elevationGainM: gainM,
      estimatedMinutes: estimateMinutes(route.distanceKm, gainM),
      terrain: terrainType,
    };
  });

  if (terrain === 'flat') {
    return suggestions.sort((a, b) => a.elevationGainM - b.elevationGainM);
  }
  if (terrain === 'hilly') {
    return suggestions.sort((a, b) => b.elevationGainM - a.elevationGainM);
  }
  return suggestions;
}
