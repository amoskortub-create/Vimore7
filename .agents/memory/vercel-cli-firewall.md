---
name: Vercel CLI package firewall
description: A recent Vercel CLI download was blocked by this workspace's package firewall.
---

The latest `pnpm dlx vercel@latest` attempt failed when the package firewall returned HTTP 403 for a transitive `tar` dependency.

**Why:** Vercel CLI was needed to validate Services-mode routing locally, but the environment prevented its installation.

**How to apply:** Check whether the current CLI version is installable before planning around `vercel dev`. Do not switch package managers to bypass the firewall; use official Vercel docs/schema and the app's own build checks, and report that CLI validation was unavailable.