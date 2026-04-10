# RouteMaster – India Logistics Fleet Tracker

Real-time fleet tracking dashboard built with **Node.js**, **Express**, **Socket.IO**, **Leaflet**, and **Chart.js**.

## Quick Start

```bash
npm install
npm start          # production
npm run dev        # development (nodemon)
```

Open **http://localhost:3001**

## Project Structure

```
routemaster/
├── server.js               # Express + Socket.IO server
├── package.json
├── views/
│   └── index.ejs           # Main HTML template
└── public/
    ├── css/
    │   └── style.css
    └── js/
        └── script.js
```

## Features

| Feature | Details |
|---------|---------|
| **Live Map** | Leaflet + MarkerCluster, 3 tile styles |
| **Real-time tracking** | Socket.IO – devices broadcast location every 3 s |
| **Demo mode** | 5 simulated vehicles if no real devices connect |
| **Measure tool** | Click points on the map to measure distance |
| **Analytics** | Chart.js – distance, hours, region distribution |
| **Dark mode** | Persisted in localStorage |
| **Weather** | Live data from Open-Meteo (no API key needed) |
| **Alerts** | Speed & route-deviation notifications |
| **Responsive** | Mobile sidebar, adaptive grid |

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/devices` | All currently tracked devices |
| `GET /api/analytics` | Sample analytics data |
| `GET /api/health` | Server uptime & device count |

## Socket Events

| Event (client → server) | Payload |
|--------------------------|---------|
| `register-device` | `{ name, latitude, longitude, speed }` |
| `update-location` | `{ latitude, longitude, speed }` |

| Event (server → client) | Payload |
|--------------------------|---------|
| `devices-update` | Array of all active devices |
| `device-disconnected` | Device id string |

## Environment

| Variable | Default |
|----------|---------|
| `PORT` | `3001` |
