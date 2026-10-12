# Working on manif

## Git workflow

- `main` is protected by a GitHub ruleset: **no direct pushes**, no force-push, no deletion. Every change lands through a pull request.
- Work on a branch named after the issue, e.g. `feat/19-home-lobby`, `fix/42-stuck-in-corner`, `chore/...`.
- Open the PR against `main` with `Closes #<issue>` as the first line of the body.
- PRs are **squash-merged** (the only merge method enabled); the branch is deleted on merge.
- Before pushing, run at the root: `bun run build && bun run typecheck && bun run lint && bun run test`. The build is the bar: typecheck and lint can pass while the build fails.

## Project notes

- Read `README.md` for the layout, commands and "Where to change things".
- Colyseus is 0.18 and its API differs a lot from older versions: load the `colyseus` skill (`.agents/skills/`) before writing Room, Schema or SDK code.
- Keep `bunfig.toml`'s `linker = "hoisted"`: without it, joins fail with "seat reservation expired".

### Code layout

Light feature folders (not strict Feature-Sliced Design). Each app's `src/` has `app/` for bootstrap, `features/<name>/` with everything for one feature (components, hooks, schema, handlers, pure logic, tests), and `shared/` for code that belongs to no single feature. The server also has `rooms/`: a room wires features together and owns the root Schema state. `packages/shared/src/` is split into domain folders (`net/`, `player/`, `lobby/`, `physics/`, `level/`). Every feature and domain folder has an `index.ts`. Use the same name for a feature across client, server and shared (`lobby`, `player`, `level`...).

Rules:

1. A feature imports another feature only through its `index.ts`, never its internal files.
2. `shared/` never imports from `features/`.
3. Tests live next to the code they test (`foo.test.ts` beside `foo.ts`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
