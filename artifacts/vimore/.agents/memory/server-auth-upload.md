---
name: Client media and proxy pattern
description: Current browser upload, same-origin media read, and microphone permission rules.
---

# Client media and proxy pattern

## The rule
Browser session checks and media uploads use Appwrite's client SDK; media reads use the same-origin `/api/file` proxy. The app's `Permissions-Policy` must allow microphone access for voice recording.

**Why:** The product explicitly chose client-only uploads after the server multipart path caused `source.on is not a function`. Direct Appwrite Storage URLs can fail for private buckets or stale browser origins, while the proxy can apply server-side read access. A `microphone=()` policy prevents the browser from granting recording permission before application code runs.

**How to apply:**
- Session check → `account.get()` plus `databases.getDocument()` in `checkSession` (PostContext.tsx).
- File uploads → `uploadViaClient(file, bucketId)` / `uploadLargeViaClient()` from `src/lib/upload.ts`, calling `storage.createFile()` in the browser.
- File reads → `getFileUrl()` / adaptive previews return `/api/file/{bucket}/{fileId}` URLs. Keep legacy direct Appwrite URLs normalized through `toProxyUrl()`.
- The current preview/deployed origin must still be registered as an Appwrite Web platform for client SDK operations.
- The response security header must use `microphone=(self)`, not `microphone=()`, for voice recording.
- `src/lib/session.ts` `getSessionUser()` reads `X-Appwrite-Session` (sent by `authFetch`) or `Authorization: Bearer <jwt>`.
