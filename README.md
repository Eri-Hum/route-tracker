# Route Tracker

A React + Leaflet app for planning walking, running and cycling routes, with two modes:

- **Draw Route** – Press the pencil, then freehand-draw a path on the map using a canvas overlay. The path is converted to lat/lng coordinates and its distance computed with the Haversine formula. With the pencil off the map pans and zooms normally.
- **Find Route** – Uses the Browser Geolocation API to find your position, then suggests circular routes that start and end there, for a target distance and terrain preference. Each suggestion shows distance, elevation gain and estimated time. **Next** generates a fresh suggestion rather than cycling a fixed set.

### How routes are chosen

Loops are laid out as a ring passing *through* your location, then routed onto the real street network with [OSRM](https://project-osrm.org/). Candidates are scored, and the best kept, on:

- **doubling back** – the fraction of the route covered more than once, which is what makes a generated route feel like a series of dead-end detours;
- **wiggliness** – how far the route turns beyond the 360° any loop must, weighted much harder for cycling than on foot;
- **pushing** – the bicycle profile drops to walking pace on footways and steps, so a route slower than the profile cruises at is one spent pushing rather than riding;
- **distance** – tuned by a bracketed search that re-plans the loop at adjusted sizes until it lands within 200 m of what you asked for, and says so when the local streets offer nothing closer.

Routes are always legal to travel: both the `foot` and `bike` OSRM profiles exclude motorways and trunk roads and honour access restrictions. If routing is unavailable the app reports an error rather than falling back to straight lines across them.

Built with:

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Leaflet](https://leafletjs.com/) / [react-leaflet](https://react-leaflet.js.org/) with [OpenStreetMap](https://www.openstreetmap.org/) tiles
- [OSRM](https://routing.openstreetmap.de/) for street routing (foot and bike profiles)
- [OpenTopoData](https://www.opentopodata.org/) for elevation

No API keys are required for any of these.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Every push to `main` builds the app and deploys it to GitHub Pages via the workflow in `.github/workflows/deploy.yml`. Enable Pages for this repo under **Settings → Pages → Source: GitHub Actions**.
