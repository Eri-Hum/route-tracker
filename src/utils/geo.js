// Geometry helpers for generating circular loop routes.

import { haversineDistance, pathDistance } from './haversine';

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Compass bearing (deg) from one point to another.
function bearingBetween([lat1, lng1], [lat2, lng2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLng = toRad(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Given a start point, bearing (deg) and distance (km), return the destination point.
export function destinationPoint([lat, lng], bearingDeg, distanceKm) {
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const angularDist = distanceKm / EARTH_RADIUS_KM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDeg(lat2), toDeg(lng2)];
}

// Waypoints of a ring that passes through `start`, walked once and closing
// back on the start.
function ringThrough(start, radiusKm, rotationDeg, shapeVariant, numPoints) {
  // Offset the ring's centre one radius away from the start, so the start
  // lies *on* the ring. Centring the ring on the start instead would force
  // every route to run a full radius out and back again just to reach it -
  // a built-in out-and-back spur on every single suggestion.
  const center = destinationPoint(start, rotationDeg, radiusKm);
  const startBearing = rotationDeg + 180;
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = startBearing + (360 * i) / numPoints;
    // Modulate the radius to make routes distinct. `shapeVariant` is the
    // amplitude directly, so callers control how far a shape may wander -
    // a bike loop wants to stay much closer to a clean ring than a run.
    const wobble = 1 + shapeVariant * Math.sin(toRad(angle * 2));
    points.push(destinationPoint(center, angle, radiusKm * wobble));
  }
  // Anchor both ends exactly on the start location.
  points[0] = start;
  points[points.length - 1] = start;

  return points;
}

// Build a closed loop route starting and ending at `start`, targeting a
// total distance of `distanceKm`, rotated by `rotationDeg` and with a shape
// variation so multiple suggestions look different.
//
// `numPoints` should stay small when these points are used as waypoints for
// a road router. Each waypoint is a hard constraint the route must pass
// through, so every extra one is another chance to force an awkward detour;
// a handful of well-spread points lets each leg be a natural shortest path.
export function generateLoopRoute(start, distanceKm, rotationDeg, shapeVariant, numPoints = 5) {
  // A ring sampled at few points is a polygon, whose perimeter falls short
  // of the circle it is inscribed in - by ~10% at 5 points. Measure the
  // polygon we actually produced and rescale, since its length varies
  // linearly with the radius.
  const nominalRadiusKm = distanceKm / (2 * Math.PI);
  const nominal = ringThrough(start, nominalRadiusKm, rotationDeg, shapeVariant, numPoints);
  const nominalLength = pathDistance(nominal);
  if (nominalLength === 0) return nominal;

  const radiusKm = nominalRadiusKm * (distanceKm / nominalLength);
  return ringThrough(start, radiusKm, rotationDeg, shapeVariant, numPoints);
}

// Fraction of a route's length that gets covered more than once.
//
// This is the "detour" measure: running down a dead-end street and back, or
// retracing a stretch to reach the next waypoint, traverses the same
// segments twice. A clean loop covers each segment once and scores ~0,
// while a route full of out-and-back spurs scores high. Segment identity is
// keyed on coordinates rounded to ~1 m and made direction-independent, so a
// stretch counts as repeated whichever way it is travelled.
export function overlapRatio(points) {
  const lengthByKey = new Map();
  const countByKey = new Map();
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = haversineDistance(a, b);
    if (length === 0) continue;

    const endpoints = [a, b]
      .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
      .sort();
    const key = endpoints.join('|');

    lengthByKey.set(key, length);
    countByKey.set(key, (countByKey.get(key) || 0) + 1);
    total += length;
  }
  if (total === 0) return 0;

  let repeated = 0;
  for (const [key, count] of countByKey) {
    if (count > 1) repeated += (count - 1) * lengthByKey.get(key);
  }
  return repeated / total;
}

// How much a route turns beyond what its shape requires, in degrees per km.
//
// This is the "wiggliness" measure. Any closed loop has to turn a full 360
// degrees to get back where it started, so only turning past that counts.
// A route that runs clean lines between corners scores near zero, while one
// that keeps jinking through side streets scores high - the difference
// between a ride and a slog. The path is resampled to an even spacing
// first, so gentle curves in a road do not read as turning while genuine
// changes of direction still do.
export function excessTurnPerKm(points, spacingKm = 0.15) {
  const total = pathDistance(points);
  if (total <= 0) return 0;

  const sampleCount = Math.max(4, Math.round(total / spacingKm));
  const sampled = resamplePath(points, sampleCount);

  let turned = 0;
  for (let i = 2; i < sampled.length; i++) {
    const delta = Math.abs(
      bearingBetween(sampled[i - 1], sampled[i]) - bearingBetween(sampled[i - 2], sampled[i - 1])
    );
    turned += delta > 180 ? 360 - delta : delta;
  }
  return Math.max(0, turned - 360) / total;
}

// Pick `numSamples` points evenly spaced (by distance) along a path. Used to
// get a manageable, consistent number of points for elevation lookups from a
// road-snapped route that may have hundreds of vertices.
export function resamplePath(points, numSamples) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineDistance(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];

  const result = [];
  for (let i = 0; i < numSamples; i++) {
    const target = (total * i) / (numSamples - 1);
    let idx = cumulative.findIndex((d) => d >= target);
    if (idx <= 0) idx = 1;

    const d0 = cumulative[idx - 1];
    const d1 = cumulative[idx];
    const t = d1 === d0 ? 0 : (target - d0) / (d1 - d0);
    const [lat0, lng0] = points[idx - 1];
    const [lat1, lng1] = points[idx];
    result.push([lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t]);
  }
  return result;
}
