# Deployment checklist

1. Run `npm ci`, `npm run check`, `npm audit --omit=dev --audit-level=high`, `npm run build:ios`, and `npx cap sync ios`.
2. Deploy Firestore rules/indexes and Storage rules from `firebase.json`.
3. Configure Application Default Credentials plus `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID` when non-default, and `FIREBASE_STORAGE_BUCKET`.
4. Configure server-only Tenor, Gemini, and Stripe secrets and one recurring `STRIPE_PRO_PRICE_ID`.
5. Register `/api/stripe/webhook`, send the documented subscription/invoice events, and verify duplicate delivery plus failure retry in Stripe test mode.
6. Set `APP_URL`, exact `ALLOWED_ORIGINS`, and native origins. Never use `*` in production.
7. Choose one collaboration topology. Use Redis for more than one instance; otherwise pin the service to one instance and set `INSTANCE_COUNT=1`.
8. Run the data-URL migration dry run before `--apply`; retain a Firestore export until migrated media is verified.
9. Configure Cloud Logging queries/alerts from the observability runbook.
10. In GitHub settings, protect `main`, require the `CI / validate` check, require an up-to-date branch, require review, and prevent direct pushes. This repository setting cannot be enforced by application code.
