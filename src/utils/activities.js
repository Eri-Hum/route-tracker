// What kind of outing a route is being planned for.
//
// Each activity picks its own OSRM routing profile and its own idea of what
// makes a good route. Both profiles exclude motorway, motorway_link, trunk
// and trunk_link and honour access restrictions, so neither will route
// anyone somewhere they are not allowed to be.

export const ACTIVITIES = {
  foot: {
    id: 'foot',
    label: 'Gå / spring',
    // routing.openstreetmap.de serves each profile from its own path.
    service: 'routed-foot',
    profile: 'foot',

    // Waypoints per candidate loop. More of them means a shape that
    // follows the intended ring more closely, at the cost of straightness.
    waypoints: 5,
    wobbleAmplitude: 0.15,

    // Following streets between two points is always longer than the
    // straight line between them, consistently enough to be worth
    // budgeting for. Rings are laid out this much smaller than the
    // requested distance so the first attempt lands near it instead of
    // overshooting by a fifth. Only a starting estimate - the distance
    // search corrects whatever the local network actually does.
    typicalDetour: 1.18,

    // Steady running pace, plus a Naismith-style penalty for climbing.
    paceMinPerKm: 6,
    ascentMinPerM: 0.1,

    // Speed the profile should manage on ordinary ground. Falling well
    // below it means the route is dragging over steps or rough paths.
    cruisingSpeedKph: 5,

    // On foot, wandering through small streets is often pleasant, so
    // wiggliness is only lightly penalised.
    straightnessWeight: 0.4,
    pushingWeight: 0.5,

    // Above this much climb per km a route counts as hilly.
    hillyGainPerKm: 8,
  },

  bike: {
    id: 'bike',
    label: 'Cykla',
    service: 'routed-bike',
    profile: 'bike',

    // Fewer waypoints leave longer legs between them, and each leg is a
    // direct route - so the loop comes out straighter, which matters far
    // more at cycling speed than on foot.
    waypoints: 4,
    wobbleAmplitude: 0.06,

    // Bikes are held to the road network more than walkers, who can cut
    // through on paths, so their detour over a straight line runs slightly
    // higher. See the note on the foot profile.
    typicalDetour: 1.22,

    paceMinPerKm: 3.5,
    ascentMinPerM: 0.04,

    cruisingSpeedKph: 15,

    // Constant turning is tiring and slow on a bike, and the profile will
    // happily route over footways and steps at walking pace, so both are
    // penalised hard.
    straightnessWeight: 2,
    pushingWeight: 2.5,

    hillyGainPerKm: 6,
  },
};

export const DEFAULT_ACTIVITY = 'foot';

export function getActivity(id) {
  return ACTIVITIES[id] ?? ACTIVITIES[DEFAULT_ACTIVITY];
}
