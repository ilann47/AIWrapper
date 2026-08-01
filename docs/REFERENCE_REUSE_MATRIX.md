# Reference reuse matrix

The previous matrix overstated reuse by calling small rewrites “integrated”. It has been retired.

The authoritative matrix is [UPSTREAM_ADOPTION.md](./UPSTREAM_ADOPTION.md). Exact per-file metrics and diffs are generated in [generated/PROVENANCE_EVIDENCE.md](./generated/PROVENANCE_EVIDENCE.md).

- **COPIED MODULE**: code is incorporated and compared line-by-line.
- **DIRECT RUNTIME IMPORT**: production executes the upstream module.
- **ADAPTER**: new glue around upstream; never counted as copied code.
- **IMPORTED, NOT YET WIRED**: source exists locally but production does not execute it.
- **IMPLEMENTAÇÃO PRÓPRIA**: written for AIWrapper.
