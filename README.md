# Cartesian to GPS Web App

A static web app that converts local Cartesian (X, Y) coordinates to GPS latitude/longitude for MultiGP drone racing tracks. Originally a QT/C++ desktop application, ported to the web with the help of [Claude](https://claude.ai).

## Features

- **Live satellite map** — Leaflet.js with Esri World Imagery tiles, updated in real-time as you adjust settings
- **Draggable origin & heading** — drag the origin marker or axis handles directly on the map
- **Mobile-friendly** — bottom sheet UI designed for use at the field on a phone
- **Export with metadata** — download as KML (Emlid Flow, Google Earth), GPX, or GeoJSON with full settings embedded for later re-import
- **Re-import** — open a previously exported file to restore the exact origin, heading, units, and track data
- **Preset locations** — save commonly used origins
- **Mirror & swap axes** — flip or swap X/Y to match your coordinate system
- **Sample tracks** — three bundled MultiGP tracks to get started

## CSV Format

Each line: `X, Y, Name`

```
42,0,Start Gate
28,0,Orbit Ladder
14,0,Flag 1
```

See the [video tutorial](https://youtu.be/VPVfUfZq8-I) for instructions on creating a CSV file.

## Usage

Visit the GitHub Pages site or open `index.html` locally. No build step, no dependencies to install — just static HTML, CSS, and JavaScript.

1. Set your origin lat/lon and heading (or pick a preset)
2. Load a CSV file or choose a sample track
3. Adjust units (feet/meters) and axis options as needed
4. Export to your preferred format
