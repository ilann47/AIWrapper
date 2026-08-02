# Reference reuse matrix

The authoritative module matrix is [UPSTREAM_ADOPTION.md](./UPSTREAM_ADOPTION.md). Exact per-file metrics and diffs are generated in [generated/PROVENANCE_EVIDENCE.md](./generated/PROVENANCE_EVIDENCE.md).

Only these literal classifications are accepted:

- `copied`: complete upstream code copied without adaptation;
- `directly imported`: production executes the upstream implementation;
- `adapter`: integration code preserves and calls the upstream architecture;
- `imported-not-wired`: source is present but not executed;
- `IMPLEMENTAÇÃO PRÓPRIA`: AIWrapper-specific code with a reviewed reference, incompatibility and parity audit.

The verifier rejects every other label.
