import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DESK_LAYOUT_STORAGE_KEY,
  parseDeskLayout,
  ResizableNewsroomLayout,
} from "./resizable-newsroom-layout";

describe("ResizableNewsroomLayout", () => {
  afterEach(() => {
    window.localStorage.removeItem(DESK_LAYOUT_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("renders the desktop Desk with an accessible resize separator", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(min-width: 52.001rem)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );

    render(
      <ResizableNewsroomLayout
        desk={<aside>The Desk</aside>}
        workspace={<main>Active work</main>}
      />,
    );

    expect(await screen.findByRole("separator", { name: "Resize the Desk" })).toBeVisible();
    expect(screen.getByText("The Desk")).toBeVisible();
    expect(screen.getByText("Active work")).toBeVisible();
  });

  it("accepts only complete, finite two-panel persisted layouts", () => {
    expect(parseDeskLayout('{"desk":34,"workspace":66}')).toEqual({
      desk: 34,
      workspace: 66,
    });
    expect(parseDeskLayout(null)).toBeNull();
    expect(parseDeskLayout("not json")).toBeNull();
    expect(parseDeskLayout('{"desk":34}')).toBeNull();
    expect(parseDeskLayout('{"desk":-1,"workspace":101}')).toBeNull();
    expect(parseDeskLayout('{"desk":20,"workspace":20}')).toBeNull();
  });
});
