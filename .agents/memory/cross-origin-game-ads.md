---
name: Cross-origin game advertising
description: Boundary for monetizing externally hosted game pages embedded by the GSix hub
---

The hub can place ads around an embedded external game, but it cannot inject AdSense into the game document when the game is hosted on another origin. The owned game source or deployment must be edited directly for ads inside that page.

**Why:** Browser same-origin isolation prevents the parent hub from safely modifying a cross-origin iframe, and overlays would reduce playability and risk accidental clicks.

**How to apply:** Keep hub placements outside the iframe. Patch each owned game site separately once its source repository or editable deployment is available.