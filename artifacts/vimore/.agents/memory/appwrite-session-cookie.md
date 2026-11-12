---
name: Appwrite browser sessions
description: User authentication uses the Appwrite Web SDK; do not restore the former server-side login/session-cookie bridge.
---

User login and signup call the Appwrite Web SDK from the browser. Session
validation, refresh, and logout also use the SDK. Do not return session secrets
from a same-origin API or add a custom JWT/cookie fallback to user auth.

The admin login endpoint is separate from the user login flow.
