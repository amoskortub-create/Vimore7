---
name: Vercel Services routing
description: Routing constraints for the Vimore Next.js app when built as a Vercel Service.
---

Do not add `middleware.ts` or `src/middleware.ts` to the Vimore Next.js service. Vercel Services rejects middleware and Edge Function output. Keep host-conditional path routing in Next.js rewrites or project-level service routes instead.

**Why:** Vercel's Services documentation explicitly excludes middleware and Edge runtime functions inside a service; changing middleware to Node.js does not remove the middleware restriction.

**How to apply:** When extending request routing for this app while it remains under the `vimore` service in `vercel.json`, use rewrites and preserve exclusions for API routes and static assets.