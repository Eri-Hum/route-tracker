// Geometry helpers for generating circular loop routes.

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
export function generateLoopRoute(start, distanceKm, rotationDeg, shapeVariant, numPoints = 24) {
  const radiusKm = distanceKm / (2 * Math.PI);
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = (360 * i) / numPoints;
    // Modulate the radius slightly per shape variant to make routes distinct.
    const wobble = 1 + shapeVariant * 0.25 * Math.sin(toRad(angle * 2));
    const bearing = angle + rotationDeg;
    const dist = radiusKm * wobble;
    points.push(destinationPoint(start, bearing, dist));
  }
  // Ensure the loop closes exactly on the start point.
  points[points.length - 1] = start;
  points[0] = start;

  return points;
}
