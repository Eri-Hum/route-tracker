# Route Tracker

A React + Leaflet app for planning running/walking routes, with two modes:

- **Draw Route** – Freehand-draw a path on the map (like MS Paint) using a canvas overlay. The path is converted to lat/lng coordinates and its distance is computed with the Haversine formula.
- **Find Route** – Uses the Browser Geolocation API to find your position, then generates 2–3 circular route suggestions of a target distance and terrain preference (flat / hilly / doesn't matter), using elevation data from [OpenTopoData](https://www.opentopodata.org/) (no API key required). Each suggestion shows distance, elevation gain, and estimated time, with an elevation profile chart for the selected route.

Built with:

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Leaflet](https://leafletjs.com/) / [react-leaflet](https://react-leaflet.js.org/) with [OpenStreetMap](https://www.openstreetmap.org/) tiles
- [OpenTopoData](https://www.opentopodata.org/) for elevation
- [Recharts](https://recharts.org/) for the elevation profile

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
