# iOS app setup

The Capacitor Xcode project is checked in under `ios/`. The iOS bundle uses `HashRouter`, `apiUrl()`, and `collaborationUrl()` so navigation stays inside the native shell while API and WebSocket traffic targets the deployed backend.

## Prerequisites

- macOS with a current Xcode release and command-line tools
- Node.js 22.14 or newer
- A deployed HTTPS Memeforge backend
- Apple/Firebase OAuth configuration for bundle ID `com.memeforge.app`

## Configure a native build

Create `.env.local`:

```sh
VITE_API_BASE_URL=https://api.memeforge.example.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

On the backend, set `ALLOWED_ORIGINS` for deployed web origins and include `capacitor://localhost` and `memeforge://localhost` in `NATIVE_APP_ORIGINS`. Production CORS rejects every other supplied origin.

## Build and open

```sh
npm ci
npm run ios:sync
npm run ios:open
```

In Xcode, select the signing team and a simulator/device. Do not run `npx cap add ios`; the platform project is versioned. Commit intentional native project/config changes, but not generated `ios/App/App/public`, Pods, build output, or user-specific Xcode state.

## Release smoke test

Before archiving, verify against the deployed backend:

1. Google/Apple login and logout.
2. Template and paginated GIF search.
3. Pro checkout/portal redirects and return links.
4. AI generation with an active entitlement.
5. Save, close, and reopen a meme with uploaded media.
6. Collaboration presence, edit synchronization, and reconnect.
7. Hash-based editor/profile deep links after relaunch.

CI validates the iOS web build and `npx cap sync ios`; an Xcode archive still requires a macOS signing environment.
