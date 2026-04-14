# Layered specs (`extends`) — operator guide

Layered specs let you share one canonical spec across multiple packages,
apps, or services in the same repository. Each leaf spec uses an `extends`
field to point at a parent (the **base**), and overrides only the fields
that differ.

This guide answers four questions every operator asks:

1. Which file do I edit for this change?
2. What happens when commands write back to a layered spec?
3. How do layers actually merge?
4. How do I bootstrap a new leaf cleanly?

A copyable end-to-end example lives at
[../specs/examples/monorepo/](../specs/examples/monorepo/).

---

## 1. Ownership: which file do I edit?

| The change is about… | Edit this file |
| --- | --- |
| A rule that must apply to every package | the **base** |
| A rule that only makes sense for one package | that package's **leaf** |
| A skill that every package needs | the **base** (under `skills`) |
| A skill that only one package needs | that package's **leaf** (under `skills`) |
| Renaming the project | the **base** (`project.name`); leaves can still override per-package |

> **One sentence:** The base owns what is shared. Each leaf owns what makes
> its package different. No command silently promotes a leaf rule into the
> base.

When validation fails, error messages name the **layer** that owns the
offending field, so you always know which file to open. Example:

```
Spec validation failed for packages/web/canonical-spec.yaml (1 error):
  Layer chain: specs/examples/monorepo/base.yaml → specs/examples/monorepo/packages/web/canonical-spec.yaml
  1. reviewChecklist.intro is required and must be a string
     (from layer: specs/examples/monorepo/base.yaml)
```

---

## 2. Writeback: what each command modifies

Every mutating command operates on a single spec path that the operator
passes via `--spec`. When that spec extends a base, the rule is uniform:

> **Mutating commands always write back to the leaf only. The base file is
> never modified.**

| Command | What it does on a layered spec |
| --- | --- |
| `agent-jump-start import-skill --spec <leaf> --skill <source>` | Adds or replaces the skill **in the leaf only**. If the colliding skill lives in the base, a leaf-level override is materialized. |
| `agent-jump-start add-skill <source> --spec <leaf>` | Same as `import-skill`, with remote source resolution. Leaf-only writeback. |
| `agent-jump-start update-skills --spec <leaf>` | Refreshes upstream-tracked skills **in the leaf only**, even if the lockfile entry was originally added to the leaf. |
| `agent-jump-start intake --spec <leaf> --import` | Imports unmanaged skill packages **into the leaf only**. |
| `agent-jump-start sync --spec <leaf>` | Reads the merged spec, regenerates instruction files. Does not modify any spec file. |
| `agent-jump-start validate --spec <leaf>` | Validates the merged spec with layer-aware error reporting. Does not modify any spec file. |

Each layered command prints a one-line notice up front so the operator
knows the contract before any change happens:

```
Layered spec detected: writeback will only modify the leaf file
packages/web/canonical-spec.yaml.
```

If you want a shared rule or skill to live in the base, edit `base.yaml`
by hand. This is intentional: promoting a leaf-only rule into the base
should be a deliberate decision, not a side effect of running a command.

---

## 3. Merge rules (per field, no magic)

There is no generic deep merge. Every field has an explicit rule.

| Field | Merge rule |
| --- | --- |
| `schemaVersion` | Always taken from the base. Overlays cannot change it. |
| `project.name`, `project.summary` | Leaf scalar replaces base scalar. |
| `project.components` | Leaf array **replaces** the entire base array. |
| `workspaceInstructions.packageManagerRule`, `runtimeRule` | Leaf scalar replaces base scalar. |
| `workspaceInstructions.sections` | Append + replace by `title`. A section with the same title replaces the base entry; new titles are appended. |
| `workspaceInstructions.validation` | Leaf array **replaces** the entire base array. |
| `reviewChecklist` | If present in the leaf, the entire object replaces the base. Omit in the leaf to inherit the base. |
| `skills` | Append + replace by `slug`. Same slug replaces the base skill; new slugs are appended. |

The chain depth is limited to **3 layers**. Circular `extends` references
are detected and reported.

---

## 4. Bootstrapping a new leaf

The fastest path is to copy the example and trim:

1. Copy
   [../specs/examples/monorepo/packages/web/canonical-spec.yaml](../specs/examples/monorepo/packages/web/canonical-spec.yaml)
   into your new package directory.
2. Update `extends` so it points at your base from the new location.
3. Keep only the fields the new package actually overrides. Delete the
   rest — they will be inherited from the base.
4. Run `agent-jump-start sync --spec <new leaf>` to render the agent
   instruction files for that package.

You can also infer an overlay from existing repo evidence:

```
agent-jump-start infer-overlay \
  --target packages/<new> \
  --base ../base.yaml \
  --output packages/<new>/canonical-spec.yaml
```

When `--base` is provided, the generated overlay starts with an `extends`
field pointing at that base and the schema validator treats it as a
partial overlay (some required fields are expected to come from the base
on merge). Without `--base`, `infer-overlay` emits a flat overlay
fragment — useful when you want to merge it manually into an existing
leaf.

---

## 5. Common pitfalls

- **"My change isn't showing up."** You probably edited the base while
  expecting a leaf-specific behavior, or vice versa. Re-read the
  ownership table above and run `validate --spec <leaf>` to see the
  active layer chain.
- **"Sync produced two different outputs in two packages."** That is the
  intended behavior. Each leaf is rendered independently against the
  merged spec. If you want the outputs to match, the divergence belongs
  in the base.
- **"`update-skills` did not touch the base."** Correct. Updates only
  modify the leaf. If the upstream skill should also be present in the
  base, copy it there manually after reviewing the change.
- **"Validation failed and the error mentions a field I never wrote."**
  Check the `(from layer: …)` annotation. The error names the layer that
  last set the offending top-level field. That is the file to open.

---

## 6. See also

- [../specs/examples/monorepo/README.md](../specs/examples/monorepo/README.md)
  — the copyable example used throughout this guide.
- The merge engine implementation lives in
  [../lib/merging.mjs](../lib/merging.mjs); layer-aware diagnostics live
  in [../lib/layered-diagnostics.mjs](../lib/layered-diagnostics.mjs).
