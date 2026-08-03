import { expect, test } from "bun:test";

test("the OpenCodex image builds AIWrapper extensions in repository layout", async () => {
  const dockerfile = await Bun.file(
    new URL("../../../Dockerfile.opencodex", import.meta.url),
  ).text();

  expect(dockerfile).toContain("FROM oven/bun:1.3.14 AS gui-build");
  expect(dockerfile).toContain("WORKDIR /workspace/apps/opencodex-gui");
  expect(dockerfile).toContain("COPY extensions /workspace/extensions");
  expect(dockerfile).toContain("ARG VITE_API_BASE=");
  expect(dockerfile).toContain("ARG VITE_AIWRAPPER_API_BASE=http://127.0.0.1:8766");
  expect(dockerfile).toContain(
    "ln -s /workspace/apps/opencodex-gui/node_modules /workspace/node_modules",
  );
  expect(dockerfile).toContain(
    "COPY --from=gui-build /workspace/apps/opencodex-gui/dist ./gui/dist",
  );
});
