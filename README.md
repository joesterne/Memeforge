<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e89538b2-29ed-46d4-bae0-da32b129d8ed

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set server-only secrets such as `GEMINI_API_KEY`, `TENOR_API_KEY`, and `STRIPE_SECRET_KEY`. Do not prefix secrets with `VITE_`; only browser-safe public values should use that prefix.
3. Run the app:
   `npm run dev`
