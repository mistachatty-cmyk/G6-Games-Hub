---
name: API Zod barrel collision
description: The API Zod barrel needs explicit exports because generated route parameter names overlap generated type names.
---

After API code generation, keep the barrel collision-safe: export generated API schemas, export `AuthUser` explicitly, and namespace the remaining generated types under `ApiTypes` rather than wildcard-exporting generated types.

**Why:** The generator recreates a wildcard generated-types export that collides with route parameter schemas such as forum parameters, causing library typecheck failures even though generated output is otherwise valid.

**How to apply:** Run codegen first, then inspect `lib/api-zod/src/index.ts` and remove only the conflicting generated-types wildcard before the final library typecheck.