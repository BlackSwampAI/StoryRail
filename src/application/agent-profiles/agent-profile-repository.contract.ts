import { isDeepStrictEqual } from "node:util";

import { beforeEach, describe, expect, it } from "vitest";

import { agentProfileId, type AgentProfile, type AgentProfileId } from "@/domain/editorial";

import type { AgentProfileRepository } from "./agent-profile-repository";

export type CreateAgentProfileRepositoryContractHarness = () =>
  AgentProfileRepository | Promise<AgentProfileRepository>;

function profile(suffix: string, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: agentProfileId(`profile-contract-${suffix}`),
    role: "writer",
    name: `Writer ${suffix}`,
    instructions: `Instructions ${suffix}.`,
    model: null,
    builtIn: false,
    ...overrides,
  };
}

export function describeAgentProfileRepositoryContract(
  createRepository: CreateAgentProfileRepositoryContractHarness,
): void {
  let repository: AgentProfileRepository;

  beforeEach(async () => {
    repository = await createRepository();
  });

  describe("AgentProfileRepository contract", () => {
    it("appends and lists durable profiles in deterministic presentation order", async () => {
      const baseline = await repository.list();
      const zeta = profile("zeta", { name: "Zeta Writer" });
      const alpha = profile("alpha", { name: "Alpha Writer" });
      await repository.append(zeta);
      await repository.append(alpha);

      await expect(repository.list()).resolves.toEqual([...baseline, alpha, zeta]);
      await expect(repository.findById(alpha.id)).resolves.toEqual(alpha);
    });

    it("returns null for an unknown Profile identity", async () => {
      await expect(repository.findById(agentProfileId("missing-profile"))).resolves.toBeNull();
    });

    it("finds the newsroom's own built-in for a role, and never a Writer someone created", async () => {
      const custom = profile("custom-writer", { name: "Custom Writer" });
      const builtIn = profile("built-in-writer", { name: "General Writer", builtIn: true });
      await repository.append(custom);
      await repository.append(builtIn);

      await expect(repository.findBuiltIn("writer")).resolves.toMatchObject({
        role: "writer",
        builtIn: true,
      });
      await expect(repository.findBuiltIn("writer")).resolves.not.toMatchObject({ id: custom.id });
    });

    it("treats an exact replay as idempotent and returns a fresh result", async () => {
      const expected = profile("replay");
      const first = await repository.append(expected);
      const second = await repository.append(structuredClone(expected));

      expect(first).toEqual({ ok: true, profile: expected });
      expect(second).toEqual({ ok: true, profile: expected });
      if (first.ok && second.ok) expect(second.profile).not.toBe(first.profile);
    });

    it("returns a stable conflict for a divergent same-ID profile without overwriting", async () => {
      const baseline = await repository.list();
      const expected = profile("conflict");
      await repository.append(expected);

      await expect(repository.append({ ...expected, name: "Different Writer" })).resolves.toEqual({
        ok: false,
        error: {
          code: "AGENT_PROFILE_ID_CONFLICT",
          message: "A different Agent Profile with the same ID already exists.",
          profileId: expected.id,
        },
      });
      await expect(repository.list()).resolves.toEqual([...baseline, expected]);
    });
  });
}

export function createReferenceAgentProfileRepository(
  initial: readonly AgentProfile[] = [],
): AgentProfileRepository {
  const profiles = new Map<AgentProfileId, AgentProfile>(
    initial.map((item) => [item.id, structuredClone(item)]),
  );
  return {
    async findById(profileId) {
      const found = profiles.get(profileId);
      return found ? structuredClone(found) : null;
    },
    async findBuiltIn(role) {
      const found = [...profiles.values()]
        .filter((candidate) => candidate.builtIn && candidate.role === role)
        .sort((left, right) => left.id.localeCompare(right.id))[0];
      return found ? structuredClone(found) : null;
    },
    async append(candidate) {
      const existing = profiles.get(candidate.id);
      if (existing) {
        return isDeepStrictEqual(existing, candidate)
          ? { ok: true, profile: structuredClone(existing) }
          : {
              ok: false,
              error: {
                code: "AGENT_PROFILE_ID_CONFLICT",
                message: "A different Agent Profile with the same ID already exists.",
                profileId: candidate.id,
              },
            };
      }
      profiles.set(candidate.id, structuredClone(candidate));
      return { ok: true, profile: structuredClone(candidate) };
    },
    async list() {
      return [...profiles.values()]
        .sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        )
        .map((item) => structuredClone(item));
    },
  };
}
