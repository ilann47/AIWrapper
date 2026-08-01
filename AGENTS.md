# Mandatory upstream reuse policy

Before implementing any component, search and open the corresponding implementation under `upstream/`, inspect its dependencies and determine whether it can be incorporated directly.

If reusable, preserve its architecture and adapt only the integration boundary. A new implementation is invalid unless its documentation records: the upstream implementation, why it cannot be used, concrete incompatibilities and why adaptation is insufficient.

Every delivered functionality must have an entry in `provenance/components.json`. Run `pnpm provenance:update` after changes and commit the generated manifest, evidence report and unified diffs. Run `pnpm provenance:verify` before committing.

Classifications must be literal: copied, directly imported, adapter, imported-not-wired or `IMPLEMENTAÇÃO PRÓPRIA`. Never label inspiration or a rewrite as reused code.

If the upstream module is materially larger, perform and document a feature-parity audit before accepting a smaller replacement.
