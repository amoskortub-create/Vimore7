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

Set `SUPER_ADMIN_USER_ID` to the Appwrite user ID that should receive the
initial `SUPER` role. New registrations are not granted administrative access
based on signup order.

Set the Appwrite project's authentication session duration to at least 30 days
for the desired Android idle-login period. While the app is active, ViMore
refreshes a valid session on foreground at most every 12 hours; an expired
server-side session cannot be renewed by the client.

## Security Setup

Run `node scripts/provision-security.mjs` from this directory with the
production Appwrite environment configured. It provisions the security event
collection and removes public collection reads. The admin dashboard reads
events through the server-side `SUPER`-only endpoint.

After changing the Appwrite signing credentials, rotate Android release
keystore credentials in the deployment secret store. Keep signing credentials
out of source control.
