import { describe, expect, it } from "vitest";

import { decodePostgresAgentProfile } from "./postgres-agent-profile-decoder";

const row = {
  profile_id: "profile-decoder-0027",
  role: "writer",
  built_in: false,
  payload: {
    id: "profile-decoder-0027",
    role: "writer",
    name: "Decoder Writer",
    instructions: "Use grounded evidence.",
    model: null,
    builtIn: false,
  },
};

describe("decodePostgresAgentProfile", () => {
  it("decodes an exact valid payload", () => {
    expect(decodePostgresAgentProfile(row)).toEqual(row.payload);
  });

  it.each([
    { ...row, profile_id: "different" },
    { ...row, role: "assignment_editor" },
    { ...row, built_in: true },
    { ...row, payload: { ...row.payload, unexpected: true } },
    { ...row, payload: { ...row.payload, name: " " } },
    { ...row, payload: { ...row.payload, model: { provider: "only" } } },
  ])("rejects malformed or divergent persistence row %#", (malformed) => {
    expect(() => decodePostgresAgentProfile(malformed)).toThrowError(
      "PostgreSQL Agent Profile persistence returned an invalid or impossible result.",
    );
  });
});
