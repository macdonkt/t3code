import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarBrandSuffix } from "./sidebarBrandLabel";

describe("resolveSidebarBrandSuffix", () => {
  it("labels dev builds as Dev", () => {
    expect(resolveSidebarBrandSuffix("Dev")).toBe("Dev");
    expect(resolveSidebarBrandSuffix(" dev ")).toBe("Dev");
  });

  it("keeps Code for every other stage", () => {
    expect(resolveSidebarBrandSuffix("Beta")).toBe("Code");
    expect(resolveSidebarBrandSuffix("Nightly")).toBe("Code");
    expect(resolveSidebarBrandSuffix("")).toBe("Code");
  });
});
