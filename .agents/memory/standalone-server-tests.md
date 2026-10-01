---
name: Standalone server-module checks
description: Run isolated Node or tsx checks for modules protected by Next's server-only package.
---

When a standalone `tsx` or Node check imports code that transitively imports `server-only`, Node's default package condition intentionally throws. Set `NODE_OPTIONS=--conditions=react-server` for the isolated check to select the server entry.

**Why:** Next supplies the React server condition during server execution, but a plain Node process does not.

**How to apply:** Use the condition only for temporary/mock checks of server modules; do not add it to normal app workflows.