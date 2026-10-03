# ViMore — Creator Platform

ViMore is a social networking and creator platform featuring social feeds, music, reels, messaging, and an admin dashboard.

## Run & Operate

**Environment Variables (set all of these in Vercel → Project → Settings → Environment Variables):**

| Variable | Required | Notes |
|---|---|---|
| `APPWRITE_API_KEY` | ✅ Yes | Appwrite server-side API key (set in Replit Secrets) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ Yes | Google Gemini AI key — translation, captions, moderation (set in Replit Secrets) |
| `AGORA_APP_CERTIFICATE` | ✅ Yes | Agora RTC token signing certificate |
| `VAPID_PRIVATE_KEY` | ✅ Yes | Web push private key — copy from `.env.local` (never print in full) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ Yes | Web push public key — safe to expose |
| `FIREBASE_PROJECT_ID` | ✅ For Android push | Firebase Admin project ID (`studio-1245266398-590b7`) |
| `FIREBASE_CLIENT_EMAIL` | ✅ For Android push | Service-account email from Firebase Admin credentials |
| `FIREBASE_PRIVATE_KEY` | ✅ For Android push | Service-account private key; store as a deployment secret |
| `CRON_SECRET` | ✅ For missed-call pushes | Random secret used to authenticate Vercel's scheduled missed-call processor |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | Optional | Defaults to `https://appwrite.mediatechliberia.online/v1` |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | Optional | Defaults to `vimore123` |
| `NEXT_PUBLIC_APPWRITE_DATABASE_ID` | Optional | Defaults to `vimoreprod` |
| `NEXT_PUBLIC_AGORA_APP_ID` | Optional | Defaults to `4afa1dbbd2ee4695ad1d29eaa0310ca3` |
| `NEXT_PUBLIC_AD_NETWORK_KEY` | Optional | Ad network publisher ID — defaults to built-in key |

**Note:** The AI code reads `GOOGLE_GENERATIVE_AI_API_KEY` first, then falls back to `GEMINI_API_KEY`. Use `GOOGLE_GENERATIVE_AI_API_KEY` for both Replit and Vercel.

**Push delivery:** Android FCM requires the three Firebase Admin service-account variables above in the server deployment in addition to `android/app/google-services.json`, and users must grant notification permission in the app. New unread messages and notifications are delivered when created. Incoming and invited calls use the high-priority `vimore_calls_v2` ringtone channel; missed calls, messages, and other notifications use `vimore_default_v2` with the notification sound. The native Firebase messaging service also posts notifications when the app process is stopped. Users can manage or mute either Android channel in system settings.

**Android release signing:** Release APKs and AABs use the upload key stored locally at `android/vimore-upload-key.jks`; its alias and passwords are stored in the git-ignored `android/signing.properties`. Build with `cd android && ./gradlew assembleRelease bundleRelease`. Keep secure backups of both files for future Play uploads. Never commit the keystore or signing properties. For Google Play App Signing, this is the upload key; Google manages the app-signing key.

**Missed-call processing:** Vercel runs `/api/cron/missed-calls` every minute. Configure `CRON_SECRET` as a Vercel secret; calls unanswered for 45 seconds are marked missed and pushed even if the caller's app is closed. Other maintenance endpoints still require a signed-in admin session.

**Commands:**
- `npm run dev`: Starts the application locally on port 5000.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: React Context API (`PostContext`, `MusicContext`, `NotificationContext`, `LanguageContext`)
- **Backend**: Appwrite (Database, Storage, Auth)
- **AI**: Groq
- **Real-time Communication**: Zegocloud (removed — call features fully removed)
- **Build Tool**: Next.js

## Where things live

- `src/app/`: Next.js App Router pages and API routes.
- `src/app/api/[...path]/route.ts`, `src/app/api/admin/[...path]/route.ts`, `src/app/api/oauth/[...path]/route.ts`: The only 3 route files under `src/app/api/`. Every API endpoint is dispatched through one of these 3 catch-all routes (Vercel Hobby plan caps at 12 serverless functions; the app previously had 51 separate `route.ts` files). Each dispatcher looks up the request path in a `ROUTES` map and calls the matching handler.
- `src/server/api-impl/`: The actual endpoint handler implementations (moved out of `route.ts` files, unchanged logic), organized as `admin/`, `oauth/`, `root/` mirroring the original API path structure. To add a new API endpoint: create a handler module here, then register it in the `ROUTES` map of the appropriate dispatcher (`admin`, `oauth`, or root).
- `src/components/`: Reusable React components.
- `src/context/`: React Context API providers (`PostContext.tsx`, `MusicContext.tsx`, `NotificationContext.tsx`).
- `src/lib/`: Utility functions and Appwrite configurations (`appwrite.ts`, `push-notifications.ts`, `utils.ts`, `data-budget.ts`).
- `public/`: Static assets, PWA manifest (`manifest.json`), service worker (`sw.js`), offline page (`offline.html`), icons.
- `appwrite.json`: Appwrite collections and bucket definitions (source of truth for DB schema).
- `next.config.ts`: Next.js configuration, including PWA settings.

## Architecture decisions

- **Appwrite as BaaS**: Chosen for its database, storage, and authentication capabilities, acting as the primary backend for all data.
- **Context API for Global State**: Leverages React's Context API for managing application-wide state, avoiding external state management libraries for simplicity.
- **PWA First**: Designed with Progressive Web App principles, including a service worker and manifest for offline capabilities and installability.
- **Server-side AI with Groq**: AI features like translation are implemented server-side using Groq to offload processing and secure API keys.
- **Zegocloud for RTC**: Zegocloud is integrated for real-time audio/video calling, replacing a previous Agora implementation, due to its comprehensive SDK and token generation.
- **Data-Saving Pass**: Implemented specific strategies (e.g., autoplay off on Lite mode, lazy loading, smaller fetch limits) to optimize data usage for users with limited data plans.

## Product

- **Social Feeds**: Users can view and interact with posts, stories, and reels.
- **Messaging**: Direct messaging functionality, including real-time updates and call features.
- **Creator Tools**: Dashboard for analytics, earnings, and currency management (Gold, Diamonds, Stars).
- **Marketplace**: Users can list and sell products with features like image uploads, contact options, and listing boosts.
- **Event Ticketing System**: Users can find events, purchase tickets, and gift them to others. Admins can create events and manage tickets.
- **Admin Dashboard (Command Core)**: Comprehensive interface for analytics, user management, content moderation, economy management, and staff roles.
- **Push Notifications**: Supports in-app and PWA push notifications for various events like new messages, call invites, and event reminders.

## User preferences

- _Populate as you build_

## Gotchas

- **Gemini key name**: The codebase uses `GOOGLE_GENERATIVE_AI_API_KEY` first and falls back to `GEMINI_API_KEY`. Set `GOOGLE_GENERATIVE_AI_API_KEY` in Vercel and Replit.
- **Messages `cluster_id`**: The `messages` Appwrite collection now has `cluster_id` (added 2026-08-05). If you see "Unknown attribute: cluster_id" on a fresh DB, add a `string(128)` optional attribute named `cluster_id` plus a key index on it to the `messages` collection.
- **Reactions `reaction_type`**: The `post_reactions` collection now has `reaction_type` (added 2026-08-05). Indexes: `idx_reaction_type` (single) and `idx_post_user_reaction` (compound: post_id + user_id + reaction_type).
- **Media uploads**: Use the browser Appwrite Web SDK (`storage.createFile`) directly. The current preview/deployed origin must be registered as an Appwrite Web platform, and the storage bucket permissions must allow the signed-in user to create files. `APPWRITE_API_KEY` remains server-only for database/auth operations and is not used for browser file uploads.
- **API routes are consolidated, not per-endpoint**: Vercel Hobby plan allows a max of 12 Serverless Functions. Do NOT create new files under `src/app/api/**/route.ts` — add a handler in `src/server/api-impl/` and register it in the `ROUTES` map of `src/app/api/[...path]/route.ts` (or the `admin`/`oauth` dispatcher, as appropriate). Adding a new standalone `route.ts` file will break the deployment by exceeding the function cap.

- **Appwrite Schema Sync**: Manual Appwrite setup for `Marketplace_Images` bucket and `Products` collection is required. Ensure all collection attributes and indexes match the code's expectations.
- **`user_id` Audit**: All `createDocument` calls for new collections must include `user_id` for proper data ownership and access control.
- **Vercel Deployment**: Requires `APPWRITE_API_KEY`, `GROQ_API_KEY`, `AGORA_APP_CERTIFICATE`, and `VAPID_PRIVATE_KEY` as environment variables. See table above for full list.
- **Cron routes**: `/api/cron/missed-calls` is protected by `CRON_SECRET` and scheduled each minute; `/api/cron/cleanup` and `/api/cron/expiry-alerts` remain session-protected admin routes.
- **Ad Network Key**: Configured via `NEXT_PUBLIC_AD_NETWORK_KEY` env var. If not set, falls back to the default publisher key in `banner-ad-node.tsx`.
- **Real-time Indexes**: The `messages` collection requires a `receiver_id` attribute index for unread message count queries to function correctly.
- **Call Button Visibility**: Call buttons in `chat-window.tsx` are only visible for accepted 1-1 DMs and are disabled if a call is already active.

## Pointers

- [Next.js Documentation](https://nextjs.org/docs)
- [Appwrite Documentation](https://appwrite.io/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [Zegocloud Documentation](https://docs.zegocloud.com/)
- [Groq API Documentation](https://groq.com/docs/api)
- [PWA Builder](https://www.pwabuilder.com/)