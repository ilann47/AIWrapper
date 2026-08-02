# Mandatory upstream reuse policy

This project is an evolved community fork. Upstream reuse is the default and original implementation is the exception.

Before implementation: search `upstream/`, open the original file and dependencies, record project/commit/license, incorporate the original architecture, adapt only its boundary, update `provenance/components.json`, regenerate evidence and run verification plus upstream tests.

An `IMPLEMENTAÇÃO PRÓPRIA` entry must identify the reviewed upstream reference, concrete incompatibility, why adaptation is insufficient and the exact AIWrapper-only responsibility. Convenience or reduced code size is not justification.

Generated proof:

- `provenance/manifest.json`: hashes, commits, licenses and line metrics;
- `provenance/diffs/*.diff`: origin-to-destination unified diffs;
- `docs/generated/PROVENANCE_EVIDENCE.md`: human-readable evidence table.

`pnpm provenance:verify` fails closed when a source, destination, diff, classification or required parity audit no longer matches.
