import { describe, expect, it } from "vitest";

import { MODEL_FAILURE_CODES } from "@/domain/editorial";

import { modelFailureExplanation, modelFailureMessage } from "./model-failure";

describe("model failure copy", () => {
  it("explains every failure code the domain can record", () => {
    for (const code of MODEL_FAILURE_CODES) {
      const explanation = modelFailureExplanation(code);
      expect(explanation.trim().length).toBeGreaterThan(0);
      expect(explanation).not.toContain(code);
    }
  });

  it("tells the operator a quota failure is their account, not the model", () => {
    const explanation = modelFailureExplanation("MODEL_QUOTA_EXHAUSTED");

    expect(explanation).toMatch(/credit|quota/i);
    expect(explanation).toMatch(/credential is valid/i);
  });

  it("keeps the durable code alongside the explanation", () => {
    const message = modelFailureMessage("Writer", {
      code: "MODEL_QUOTA_EXHAUSTED",
    });

    expect(message).toContain("Writer failed.");
    expect(message).toContain("(MODEL_QUOTA_EXHAUSTED)");
  });
});
