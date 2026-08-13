import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "./safe-markdown";

describe("SafeMarkdown", () => {
  it("renders editorial Markdown without executing raw HTML or activating unsafe URLs", () => {
    const { container } = render(
      <SafeMarkdown
        markdown={
          "# Evidence\n\nReadable **fact** with [safe](https://example.com/path), " +
          "[unsafe](javascript:alert(1)), and <script>window.hacked = true</script>."
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Evidence" })).toBeVisible();
    expect(screen.getByText("fact")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute(
      "href",
      "https://example.com/path",
    );
    expect(screen.queryByRole("link", { name: "unsafe" })).not.toBeInTheDocument();
    expect(screen.getByText(/<script>window\.hacked = true<\/script>/)).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
  });
});
