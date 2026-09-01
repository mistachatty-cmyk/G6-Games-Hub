---
name: Playwright service-worker routes
description: Why navigation stubs in the hub browser tests need service workers disabled
---

Playwright request routing does not intercept document navigations handled by a service worker. Browser tests that stub navigation endpoints must run with service workers blocked; otherwise the page can navigate against the real server even when an apparent route stub exists.

**Why:** The hub registers a navigation service worker, and an auth logout navigation bypassed the test route handler while API request stubs continued to work.

**How to apply:** Keep service workers blocked in the Playwright context when asserting deterministic auth or other document-navigation requests.