# ViMore

ViMore is a Next.js application for social publishing, messaging, music, and
marketplace workflows. It uses Appwrite for authentication, data, and storage.

## Development

Install the workspace dependencies from the repository root with `pnpm install`,
then run `pnpm dev` from this directory. Run `pnpm exec tsc --noEmit` and
`pnpm exec next build` before deployment.

## Required Configuration

Configure `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`,
`NEXT_PUBLIC_APPWRITE_DATABASE_ID`, and the server-only `APPWRITE_API_KEY` in
the deployment environment. Never expose `APPWRITE_API_KEY` through a
`NEXT_PUBLIC_` variable.

Configure the server-only `MTL_ACCOUNT_SECRET` in the production deployment
environment for audio and video calls. The calls API reads this variable at
request time; do not prefix it with `NEXT_PUBLIC_` or put it in Capacitor
configuration, client code, or an APK. After adding or changing it in Vercel,
redeploy the production deployment so the serverless API receives the value.

The Android Capacitor app loads the production site at `https://vimore.cfd`
(`capacitor.config.ts`) and calls its same-origin `/api/calls` endpoint. This is
runtime server configuration, not a value that is bundled by `next build` or
`cap sync`. If calls work on another web hostname but not in the APK, check the
APK's loaded hostname and ensure that hostname is routed to the same Vercel
deployment with `MTL_ACCOUNT_SECRET` configured.

The HTTPS app site registers the same service worker in Android's Capacitor
WebView as it does in a regular browser. The worker keeps its static shell,
visited pages, and eligible media in WebView Cache Storage for offline fallback;
it does not cache call API requests. Since the APK loads the site remotely, it
must first load online and install the worker before offline fallback is
available.

Set `SUPER_ADMIN_USER_ID` to the Appwrite user ID that should receive the
initial `SUPER` role. New registrations are not granted administrative access
based on signup order.

Set the Appwrite project's authentication session duration to at least 30 days
for the desired Android idle-login period. While the app is active, ViMore
refreshes a valid session on foreground at most every 12 hours; an expired
server-side session cannot be renewed by the client.

Password recovery using security questions is disabled because those answers
were stored in user profiles that may be readable by clients. Before deploying
this change, run `node scripts/clear-legacy-security-answers.mjs` from this
directory to preview the affected records, then rerun with `--apply` to clear
legacy answers and questions. Recovery requires a verified contact method and
is not available until one is implemented.

## Security Setup

Run `node scripts/provision-security.mjs` from this directory with the
production Appwrite environment configured. It provisions the security event
collection and removes public collection reads. The admin dashboard reads
events through the server-side `SUPER`-only endpoint.

After changing the Appwrite signing credentials, rotate Android release
keystore credentials in the deployment secret store. Keep signing credentials
out of source control.
