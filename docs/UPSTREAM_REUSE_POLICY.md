# Mandatory upstream reuse policy

This project is an evolved community fork. Upstream reuse is the default and original implementation is the exception.

## Required workflow

1. Search all pinned projects under `upstream/`.
2. Open the original implementation and its direct dependencies.
3. Record project, file, commit and license.
4. Incorporate the original module while preserving architecture.
5. Adapt only the integration boundary.
6. Add the mapping to `provenance/components.json`.
7. Run `pnpm provenance:update` and review the generated unified diff.
8. Run `pnpm provenance:verify`, type checking and tests.

## Exception requirements

An `IMPLEMENTAÇÃO PRÓPRIA` entry must name the reference that already addresses the problem, list concrete incompatibilities, explain why direct incorporation fails and explain why a smaller adapter is insufficient. “Simpler”, “more convenient” and “different language” alone are not sufficient.

No equivalent provenance generator was found in Codex-Wrapper, OpenCodex or codex-profiles. The generator/verifier architecture is therefore incorporated from `codex-multi-auth/scripts/{update,verify}-vendor-provenance.mjs` at commit `89ca9696`, with additions for LCS metrics and unified diffs required by AIWrapper.

## Generated proof

- `provenance/manifest.json`: machine-readable hashes, commits, licenses and line metrics.
- `provenance/diffs/*.diff`: origin-to-destination unified diffs.
- `docs/generated/PROVENANCE_EVIDENCE.md`: human-readable evidence table.

CI executes `pnpm provenance:verify`. A destination, source or stored diff changed without regeneration fails closed.
