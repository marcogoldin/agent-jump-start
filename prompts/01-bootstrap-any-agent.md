# Bootstrap Prompt

Use this prompt in any supported coding assistant (Claude Code, Copilot, Cursor, Windsurf, Cline, Roo Code, Continue.dev, Aider, or GitHub Agents) after copying `docs/agent-jump-start` into a repository.

```text
Set up the portable agent-instruction system in this repository by using the files under `docs/agent-jump-start`.

Rules:
- Treat `docs/agent-jump-start/canonical-spec.yaml` as the only long-term source of truth.
- Do not hand-edit generated files when the same change belongs in the canonical spec.
- Keep all agent instruction files aligned unless I explicitly ask for an agent-specific deviation.
- Mirror skill guidance into all agent-specific directories (.agents, .claude, .cursor, etc.).

Tasks:
1. Read `docs/agent-jump-start/README.md`.
2. Choose the best starting profile under `docs/agent-jump-start/specs/profiles/` for this repository, or tell me if none is suitable.
3. Bootstrap `docs/agent-jump-start/canonical-spec.yaml` from the base spec and the chosen profile if it does not exist yet.
4. Customize the canonical spec to match the real stack, project rules, and validation commands of this repository.
5. Run the render command from the jump-start script.
6. Run the sync check.
7. Summarize the generated file tree and any remaining manual decisions.
```
