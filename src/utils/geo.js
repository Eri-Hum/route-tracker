// Geometry helpers for generating circular loop routes.

import { haversineDistance } from './haversine';

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
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

// Build a closed loop route starting/ending at `start`, targeting a total
// distance of `distanceKm`, rotated by `rotationDeg` and with a shape
// variation so multiple suggestions look different.
//
// `numPoints` should stay small (single digits) when these points are used
// as waypoints for a road router: a router connects waypoints in order via
// the shortest street path between each pair, so many closely-spaced points
// force it to hop between adjacent parallel streets instead of following a
// natural route.
export function generateLoopRoute(start, distanceKm, rotationDeg, shapeVariant, numPoints = 8) {
  const radiusKm = distanceKm / (2 * Math.PI);
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = (360 * i) / numPoints;
    // Modulate the radius slightly per shape variant to make routes distinct.
    const wobble = 1 + shapeVariant * 0.15 * Math.sin(toRad(angle * 2));
    const bearing = angle + rotationDeg;
    const dist = radiusKm * wobble;
    points.push(destinationPoint(start, bearing, dist));
  }
  // Ensure the loop closes exactly on the start point.
  points[points.length - 1] = start;
  points[0] = start;

  return points;
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
