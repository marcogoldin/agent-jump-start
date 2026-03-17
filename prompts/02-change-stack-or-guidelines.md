# Update Prompt

Use this prompt when the stack, runtime rules, or project guidelines change.

```text
Update the synchronized agent-instruction system for this repository.

Rules:
- Edit `docs/agent-jump-start/canonical-spec.yaml` first.
- Regenerate all agent instruction files after changing the canonical spec.
- Do not patch generated files directly unless you are fixing the generator itself.
- All 9 agent targets (Claude, Copilot, Cursor, Windsurf, Cline, Roo Code, Continue.dev, Aider, GitHub Agents) must stay in sync.

Tasks:
1. Read `docs/agent-jump-start/canonical-spec.yaml` and `docs/agent-jump-start/README.md`.
2. Apply the requested stack, framework, policy, or validation changes only in the canonical spec.
3. If the existing skills are not enough, extend the canonical spec with new or updated skills.
4. Run the render command.
5. Run the sync check.
6. Report which generated files changed and call out any intentional contract changes.
```
