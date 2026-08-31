---
name: OpenAPI integer compatibility
description: OpenAPI integer schemas can generate unsupported top-level Zod helpers in this workspace.
---

When adding integer-valued API fields, use a numeric schema with `multipleOf: 1` instead of OpenAPI `type: integer` until the workspace Zod runtime is upgraded.

**Why:** The installed Zod 3 runtime does not expose the top-level `zod.int()` helper emitted by the current Orval generator for integer schemas, while `zod.number().multipleOf(1)` is compatible and preserves integer validation.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run API codegen and the library typecheck; inspect generated Zod output before relying on integer schemas.