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
