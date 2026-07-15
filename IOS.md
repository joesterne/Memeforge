# iOS app setup

Memeforge is configured as a Capacitor iOS app. The React/Vite bundle is built into `dist/` and Capacitor packages that bundle into a native iOS shell.

## Prerequisites

- macOS with Xcode installed
- Node.js and npm
- A deployed Memeforge API server for features that call `/api/*` or Socket.IO

## First-time native project generation

```sh
npm install
npx cap add ios
```

## Configure the API server

Create `.env.local` and set `VITE_API_BASE_URL` to your deployed backend origin:

```sh
VITE_API_BASE_URL=https://your-memeforge-api.example.com
```

The iOS build uses this value for API calls and Socket.IO. When it is unset, the web build keeps using same-origin relative API paths.

## Build and sync iOS

```sh
npm run ios:sync
npm run ios:open
```

From Xcode, select a team, bundle signing settings, simulator or device, then run/archive the app.
