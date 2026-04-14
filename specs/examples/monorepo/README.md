# Monorepo example — layered specs

A realistic two-package monorepo using `extends` to share one base across a
web frontend and an API backend. Copy this folder as a template when you need
layered specs in a real repository.

## Layout

```
specs/examples/monorepo/
├── base.yaml                              ← shared base (primary slice)
└── packages/
    ├── web/canonical-spec.yaml            ← frontend leaf (extends base)
    └── api/canonical-spec.yaml            ← backend leaf (extends base)
```

## Which file do I edit for this change?

The single question every operator asks. Use this table before opening an
editor.

| The change is about… | Edit this file |
| --- | --- |
| A rule that must apply to **both** web and api | `base.yaml` |
| A rule that only makes sense for the **web** package | `packages/web/canonical-spec.yaml` |
| A rule that only makes sense for the **api** package | `packages/api/canonical-spec.yaml` |
| A skill that both packages need | `base.yaml`, under `skills` |
| A skill that only one package needs | That package's leaf spec, under `skills` |
| Renaming the whole project | `base.yaml` (leaves can still override per-package display name) |

## Ownership in one sentence

> The **base** owns what is shared; each **leaf** owns what makes its package
> different. Commands that write back to a layered spec always write to the
> leaf.

## Writeback rules (memorize these three)

1. `agent-jump-start import-skill --spec <leaf>` writes the new skill into the
   **leaf**, never the base.
2. `agent-jump-start update-skills --spec <leaf>` updates skills inside the
   **leaf**, never the base.
3. `agent-jump-start intake --spec <leaf>` accepts evidence into the **leaf**,
   never the base.

If you want a change to be shared across packages, edit `base.yaml` by hand.
No command silently promotes a leaf rule to the base.

## Bootstrapping a new package

1. Copy `packages/web/canonical-spec.yaml` (or the api leaf) into the new
   package directory.
2. Change `extends` to point at the base from the new package's folder.
3. Keep only the fields the new package actually overrides. Delete everything
   else — it will be inherited from the base.
4. Run `agent-jump-start sync --spec packages/<new>/canonical-spec.yaml` to
   render the agent instruction files for that package.

## Merge rules recap

- Scalars (`project.name`, `packageManagerRule`, `runtimeRule`, …) — the leaf
  replaces the base.
- `project.components` and `workspaceInstructions.validation` — the leaf
  replaces the entire array. This is intentional: per-package components and
  validation commands almost always diverge.
- `workspaceInstructions.sections` — append and replace by `title`. A section
  with the same title replaces the base; a new title is appended after the
  base sections.
- `reviewChecklist` — if the leaf provides `reviewChecklist`, it replaces the
  base object. Omit it in the leaf to inherit the base checklist.
- `skills` — append and replace by `slug`. Same slug replaces the base skill;
  new slugs are appended.

## Related docs

- [../../../docs/layered-specs.md](../../../docs/layered-specs.md) — the full
  operator guide to layered specs.
