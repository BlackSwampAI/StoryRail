import { beforeEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  DEFAULT_THEME,
  isNewsroomTheme,
  NEWSROOM_THEMES,
  readStoredTheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("newsroom theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("offers a light and a dark option in each direction", () => {
    const schemes = NEWSROOM_THEMES.map((theme) => theme.scheme);
    expect(schemes.filter((scheme) => scheme === "Dark")).toHaveLength(2);
    expect(schemes.filter((scheme) => scheme === "Light")).toHaveLength(2);
  });

  it("applies the choice to the document and remembers it", () => {
    applyTheme("newsprint");

    expect(document.documentElement.getAttribute("data-theme")).toBe("newsprint");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("newsprint");
    expect(readStoredTheme()).toBe("newsprint");
  });

  it("falls back to the default rather than trusting stored rubbish", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");

    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    expect(isNewsroomTheme("not-a-theme")).toBe(false);
  });

  it("survives storage being unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage is blocked");
      },
    });

    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    expect(() => applyTheme("slate")).not.toThrow();

    if (original) Object.defineProperty(globalThis, "localStorage", original);
  });
});
