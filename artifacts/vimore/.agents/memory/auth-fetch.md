---
name: authFetch — authenticated server API calls
description: How authenticated calls to the remaining Next.js API routes pass Appwrite sessions.
---

The browser Appwrite SDK stores sessions in local storage. `src/lib/auth-fetch.ts`
reads the SDK's `cookieFallback` value and adds it as `X-Appwrite-Session` to
authenticated calls to the remaining Next.js API routes. Use `authFetch` for
those protected routes.

User login, signup, session validation/refresh, and logout are different: they
use the Appwrite Web SDK directly and must not call `/api/auth/*`.
