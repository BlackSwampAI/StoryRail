import { describe, expect, it } from "vitest";

import { TOOL_FAILURE_CODES, type AgentToolCall } from "@/domain/editorial";

import {
  toolArgumentSummary,
  toolFailureExplanation,
  toolFailureMessage,
  toolLabel,
} from "./tool-outcome";

describe("telling an operator what a tool call was", () => {
  it("names a registered tool in words and leaves an unknown one as recorded", () => {
    expect(toolLabel("fetch_url")).toBe("Retrieved a page");
    expect(toolLabel("an_operators_own_tool")).toBe("an_operators_own_tool");
  });

  it("shows the address a fetch was for, without its scheme", () => {
    expect(toolArgumentSummary({ url: "https://www.apple.com/mac-studio/" })).toBe(
      "www.apple.com/mac-studio/",
    );
  });

  it("shows the words a search was made with", () => {
    expect(toolArgumentSummary({ query: '"Mac Studio" "M5 Ultra"' })).toBe(
      '"Mac Studio" "M5 Ultra"',
    );
  });

  it("says nothing rather than something meaningless for a request with no readable argument", () => {
    expect(toolArgumentSummary({ options: { depth: 2 } })).toBeNull();
    expect(toolArgumentSummary({})).toBeNull();
  });
});

describe("explaining a refused tool call", () => {
  it("explains every failure a tool can record, so none reaches the screen as a bare code", () => {
    for (const code of TOOL_FAILURE_CODES) {
      expect(toolFailureExplanation(code).length).toBeGreaterThan(0);
    }
  });

  // The kind of failure and the particular target are different facts and an operator needs
  // both: "refused" says nothing about which site said no.
  it("keeps the tool's own message alongside the explanation and the durable code", () => {
    expect(
      toolFailureMessage({ code: "TOOL_TARGET_REFUSED", message: "theverge.com answered 403." }),
    ).toBe(
      "The target refused to be read. That is the site's decision, not a fault here; another Source has to carry this. theverge.com answered 403. (TOOL_TARGET_REFUSED)",
    );
  });

  it("still names the code when the tool recorded no message of its own", () => {
    expect(toolFailureMessage({ code: "TOOL_BUDGET_EXHAUSTED", message: null })).toBe(
      "The run had already spent every tool call it was allowed. (TOOL_BUDGET_EXHAUSTED)",
    );
  });
});

describe("reading a tool call's arguments as they arrive", () => {
  it("prefers the argument that says what the call was for over the rest of the request", () => {
    const request: AgentToolCall["request"] = {
      maximumResults: 8,
      query: "Thunderbolt 5 clustering",
    };

    expect(toolArgumentSummary(request)).toBe("Thunderbolt 5 clustering");
  });
});
