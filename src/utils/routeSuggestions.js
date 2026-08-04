import { generateLoopRoute } from './geo';
import { pathDistance } from './haversine';
import { fetchElevations, elevationGain } from './elevation';

const POINTS_PER_ROUTE = 20;
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

export async function findRouteSuggestions(start, distanceKm, terrain) {
  const candidateRoutes = CANDIDATES.map((c) =>
    generateLoopRoute(start, distanceKm, c.rotation, c.shape, POINTS_PER_ROUTE)
  );

  // Batch every point from every candidate into as few API calls as possible.
  const flatPoints = candidateRoutes.flat();
  const flatElevations = await fetchElevations(flatPoints);

  let cursor = 0;
  const suggestions = candidateRoutes.map((points, idx) => {
    const elevations = flatElevations.slice(cursor, cursor + points.length);
    cursor += points.length;

    const gainM = elevationGain(elevations);
    const distanceKmActual = pathDistance(points);
    const terrainType = classify(gainM, distanceKmActual);

    return {
      id: `route-${idx}`,
      points,
      elevations,
      distanceKm: distanceKmActual,
      elevationGainM: gainM,
      estimatedMinutes: estimateMinutes(distanceKmActual, gainM),
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
