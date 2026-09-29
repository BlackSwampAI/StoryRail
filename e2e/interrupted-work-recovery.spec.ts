import { expect, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createPostgresPolicyRunRepository } from "@/adapters/policy-run-persistence";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence/postgres-source-repositories";
import { createPostgresStoryRepository } from "@/adapters/story-persistence/postgres-story-repository";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence/postgres-story-source-attachment-repository";
import {
  agentProfileId,
  agentRunId,
  attachSourceToStory,
  createStory,
  intakeUrlSource,
  operatorId,
  policyRunId,
  recordAgentRun,
  recordSourceExtraction,
  sourceExtractionId,
  sourceId,
  storyId,
  type AgentRun,
  type PolicyRun,
  type SiteId,
  type SourceId,
  type StoryId,
} from "@/domain/editorial";

import { ACCEPTANCE_OPERATOR_ID, createAcceptanceSite } from "./support/acceptance-site";

const databaseUrl = process.env.STORYRAIL_TEST_DATABASE_URL as string;
const actor = { type: "operator" as const, operatorId: operatorId(ACCEPTANCE_OPERATOR_ID) };
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60_000).toISOString();

interface Reconciliation {
  readonly ok: boolean;
  readonly abandonedPolicyRuns: readonly { id: string; storyId: string | null; step: string }[];
  readonly abandonedAgentRuns: readonly {
    id: string;
    storyId: string;
    role: string;
    operation: string;
  }[];
  readonly abandonedToolCalls: readonly unknown[];
}

interface ObservedPolicyRun {
  readonly status: string;
  readonly step: string;
  readonly conclusion?: string;
  readonly reason?: string;
}

/** The operator-facing recovery action: there is no screen for it, so the endpoint is the path. */
async function reconcile(request: APIRequestContext, api: string): Promise<Reconciliation> {
  const response = await request.post(`${api}/reconciliation`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Reconciliation;
}

async function readPolicyRun(
  request: APIRequestContext,
  api: string,
  id: string,
): Promise<ObservedPolicyRun> {
  const response = await request.get(`${api}/policy-runs/${encodeURIComponent(id)}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { run: ObservedPolicyRun }).run;
}

async function readAgentRuns(request: APIRequestContext, api: string, story: StoryId) {
  const response = await request.get(`${api}/stories/${encodeURIComponent(story)}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    inspection: {
      story: { state: string };
      agentRuns: readonly {
        id: string;
        outcome: string;
        failure?: { code: string; retryable: boolean };
      }[];
    };
  };
  return body.inspection;
}

function runningPolicy(command: {
  readonly id: string;
  readonly storyId: StoryId | null;
  readonly sourceId: SourceId | null;
  readonly step: PolicyRun["step"];
  readonly observedAt: string;
}): PolicyRun {
  return {
    id: policyRunId(command.id),
    storyId: command.storyId,
    sourceId: command.sourceId,
    policy: "autopilot",
    requestedBy: actor,
    research: false,
    startedAt: command.observedAt,
    step: command.step,
    attempt: 1,
    observedAt: command.observedAt,
    status: "running",
  };
}

/** A Story with one attached, extracted Source, which is the evidence a run would have read. */
async function seedStoryWithEvidence(pool: Pool, site: SiteId, suffix: string) {
  const source = intakeUrlSource(
    {
      sourceId: sourceId(`source-${suffix}`),
      submittedUrl: `https://${suffix}.acceptance.storyrail.test/harbour-notice`,
      submittedBy: actor,
      receivedAt: "2026-09-06T10:00:00.000Z",
    },
    [],
  );
  if (!source.ok) throw new Error("Acceptance Source fixture is invalid.");
  const extractionIdentity = sourceExtractionId(`extraction-${suffix}`);
  const extraction = recordSourceExtraction({
    extractionId: extractionIdentity,
    source: source.source,
    extractor: { key: "acceptance", version: "1" },
    requestedBy: actor,
    startedAt: "2026-09-06T10:01:00.000Z",
    completedAt: "2026-09-06T10:01:01.000Z",
    outcome: "succeeded",
    document: {
      format: "markdown",
      content: "Harbour service was restored Monday.",
      title: "Harbour service notice",
      byline: null,
      publishedAt: null,
      language: "en",
    },
  });
  if (!extraction.ok) throw new Error("Acceptance extraction fixture is invalid.");
  const storyIdentity = storyId(`story-${suffix}`);
  const story = createStory({
    storyId: storyIdentity,
    title: "Harbour service restoration",
    createdAt: "2026-09-06T10:02:00.000Z",
  });
  if (!story.ok) throw new Error("Acceptance Story fixture is invalid.");
  const attachment = attachSourceToStory({
    storyId: storyIdentity,
    sourceId: source.source.id,
    relevance: "Primary service restoration notice",
    attachedBy: actor,
    attachedAt: "2026-09-06T10:03:00.000Z",
  });
  if (!attachment.ok) throw new Error("Acceptance attachment fixture is invalid.");

  const sources = createPostgresSourceRepositories({ pool, siteId: site });
  expect((await sources.sources.persist({ source: source.source })).ok).toBe(true);
  expect((await sources.extractions.append({ extraction: extraction.extraction })).ok).toBe(true);
  expect(
    (await createPostgresStoryRepository({ pool, siteId: site }).persist({ story: story.story }))
      .ok,
  ).toBe(true);
  expect(
    (
      await createPostgresStorySourceAttachmentRepository({ pool, siteId: site }).attach({
        attachment: attachment.attachment,
      })
    ).ok,
  ).toBe(true);
  return { storyId: storyIdentity, sourceId: source.source.id, extractionId: extractionIdentity };
}

async function seedBareStory(pool: Pool, site: SiteId, suffix: string): Promise<StoryId> {
  const identity = storyId(`story-${suffix}`);
  const story = createStory({
    storyId: identity,
    title: `Unrelated Story ${suffix}`,
    createdAt: "2026-09-06T10:02:00.000Z",
  });
  if (!story.ok) throw new Error("Acceptance Story fixture is invalid.");
  expect(
    (await createPostgresStoryRepository({ pool, siteId: site }).persist({ story: story.story }))
      .ok,
  ).toBe(true);
  return identity;
}

/** The Assignment Editor run a dead process would leave behind: started, never completed. */
async function runningProposalRun(
  request: APIRequestContext,
  api: string,
  evidence: Awaited<ReturnType<typeof seedStoryWithEvidence>>,
  suffix: string,
): Promise<AgentRun> {
  const listed = await request.get(`${api}/agent-profiles`);
  expect(listed.ok()).toBeTruthy();
  const { profiles } = (await listed.json()) as {
    profiles: readonly { id: string; role: string; builtIn: boolean }[];
  };
  const editor = profiles.find(({ role, builtIn }) => role === "assignment_editor" && builtIn);
  const writer = profiles.find(({ role }) => role === "writer");
  if (!editor || !writer) throw new Error("The acceptance Site has no built-in staff.");
  const recorded = recordAgentRun({
    id: agentRunId(`run-${suffix}`),
    storyId: evidence.storyId,
    profileId: agentProfileId(editor.id),
    role: "assignment_editor",
    operation: "assignment_proposal",
    model: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    prompt: { key: "storyrail_assignment_editor", version: "1" },
    requestedBy: actor,
    startedAt: hoursAgo(1),
    completedAt: null,
    input: {
      story: {
        id: evidence.storyId,
        title: "Harbour service restoration",
        state: "intake",
        revisionCycle: 0,
      },
      evidence: [
        {
          sourceId: evidence.sourceId,
          relevance: "Primary service restoration notice",
          evidenceKind: "raw",
          evidenceId: evidence.extractionId,
        },
      ],
      unavailableSourceIds: [],
      writerProfileIds: [agentProfileId(writer.id)],
    },
    outcome: "running",
  });
  if (!recorded.ok) throw new Error("Acceptance AgentRun fixture is invalid.");
  return recorded.run;
}

test.describe("recovering interrupted work", () => {
  test("closes a URL policy run that died before it had a Story, and only that one", async ({
    request,
  }) => {
    const site = await createAcceptanceSite(request, "recover-url");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const sources = createPostgresSourceRepositories({ pool, siteId: site.id });
      const policies = createPostgresPolicyRunRepository({ pool, siteId: site.id });
      const seedSource = async (suffix: string) => {
        const source = intakeUrlSource(
          {
            sourceId: sourceId(`source-${suffix}`),
            submittedUrl: `https://${suffix}.acceptance.storyrail.test/harbour-notice`,
            submittedBy: actor,
            receivedAt: "2026-09-06T10:00:00.000Z",
          },
          [],
        );
        if (!source.ok) throw new Error("Acceptance Source fixture is invalid.");
        expect((await sources.sources.persist({ source: source.source })).ok).toBe(true);
        return source.source.id;
      };
      const deadSource = await seedSource(`dead-${site.unique}`);
      const liveSource = await seedSource(`live-${site.unique}`);
      const deadRunId = `policy-dead-${site.unique}`;
      const liveRunId = `policy-live-${site.unique}`;
      // The dead process stopped inside preparation; the live one reported just now.
      expect(
        (
          await policies.append(
            runningPolicy({
              id: deadRunId,
              storyId: null,
              sourceId: deadSource,
              step: "source_preparation",
              observedAt: hoursAgo(1),
            }),
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await policies.append(
            runningPolicy({
              id: liveRunId,
              storyId: null,
              sourceId: liveSource,
              step: "source_intake",
              observedAt: new Date().toISOString(),
            }),
          )
        ).ok,
      ).toBe(true);
      await expect(readPolicyRun(request, site.api, deadRunId)).resolves.toMatchObject({
        status: "running",
        step: "source_preparation",
      });

      const report = await reconcile(request, site.api);
      expect(report.ok).toBe(true);
      expect(report.abandonedPolicyRuns).toEqual([
        { id: deadRunId, storyId: null, step: "source_preparation" },
      ]);
      // Nothing before story creation is an AgentRun, so there is nothing else to close.
      expect(report.abandonedAgentRuns).toEqual([]);
      expect(report.abandonedToolCalls).toEqual([]);

      const settled = await readPolicyRun(request, site.api, deadRunId);
      expect(settled).toMatchObject({
        status: "settled",
        conclusion: "abandoned",
        step: "source_preparation",
      });
      expect(settled.reason).toContain("Nothing reported progress at source_preparation");
      await expect(readPolicyRun(request, site.api, liveRunId)).resolves.toMatchObject({
        status: "running",
        step: "source_intake",
      });

      // Recovery closes rather than resumes, so asking again finds nothing further to close.
      const again = await reconcile(request, site.api);
      expect(again.abandonedPolicyRuns).toEqual([]);
      expect(again.abandonedAgentRuns).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test("closes an abandoned policy run together with the AgentRun it left running", async ({
    request,
  }) => {
    const site = await createAcceptanceSite(request, "recover-story");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const evidence = await seedStoryWithEvidence(pool, site.id, `story-${site.unique}`);
      const bystander = await seedBareStory(pool, site.id, `bystander-${site.unique}`);
      const run = await runningProposalRun(request, site.api, evidence, site.unique);
      expect((await createPostgresAgentRunRepository({ pool }).append(run)).ok).toBe(true);
      const policies = createPostgresPolicyRunRepository({ pool, siteId: site.id });
      const deadRunId = `policy-dead-${site.unique}`;
      const liveRunId = `policy-live-${site.unique}`;
      expect(
        (
          await policies.append(
            runningPolicy({
              id: deadRunId,
              storyId: evidence.storyId,
              sourceId: null,
              step: "assignment_proposal",
              observedAt: hoursAgo(1),
            }),
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await policies.append(
            runningPolicy({
              id: liveRunId,
              storyId: bystander,
              sourceId: null,
              step: "assignment_proposal",
              observedAt: new Date().toISOString(),
            }),
          )
        ).ok,
      ).toBe(true);
      const before = await readAgentRuns(request, site.api, evidence.storyId);
      expect(before.agentRuns).toEqual([
        expect.objectContaining({ id: run.id, outcome: "running" }),
      ]);

      const report = await reconcile(request, site.api);
      expect(report.ok).toBe(true);
      expect(report.abandonedPolicyRuns).toEqual([
        { id: deadRunId, storyId: evidence.storyId, step: "assignment_proposal" },
      ]);
      expect(report.abandonedAgentRuns).toEqual([
        {
          id: run.id,
          storyId: evidence.storyId,
          role: "assignment_editor",
          operation: "assignment_proposal",
        },
      ]);

      await expect(readPolicyRun(request, site.api, deadRunId)).resolves.toMatchObject({
        status: "settled",
        conclusion: "abandoned",
        step: "assignment_proposal",
      });
      const after = await readAgentRuns(request, site.api, evidence.storyId);
      // The Story stays exactly where the domain left it; what happens next is an operator call.
      expect(after.story.state).toBe("intake");
      expect(after.agentRuns).toEqual([
        expect.objectContaining({
          id: run.id,
          outcome: "failed",
          failure: { code: "MODEL_RUN_ABANDONED", retryable: true },
        }),
      ]);
      // A policy that reported recently is still somebody's live automation.
      await expect(readPolicyRun(request, site.api, liveRunId)).resolves.toMatchObject({
        status: "running",
      });
    } finally {
      await pool.end();
    }
  });

  test("closes a stale manual AgentRun that no policy owns and leaves a recent one alone", async ({
    request,
  }) => {
    const site = await createAcceptanceSite(request, "recover-manual");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const stale = await seedStoryWithEvidence(pool, site.id, `stale-${site.unique}`);
      const recent = await seedStoryWithEvidence(pool, site.id, `recent-${site.unique}`);
      const staleRun = await runningProposalRun(request, site.api, stale, `stale-${site.unique}`);
      const recentRun = await runningProposalRun(
        request,
        site.api,
        recent,
        `recent-${site.unique}`,
      );
      // Recovery age is the instant PostgreSQL accepted the run, which no caller can supply
      // through the repository, so the dead process's run is inserted as it would have been an
      // hour ago.
      await pool.query(
        `INSERT INTO storyrail.agent_runs
           (run_id, story_id, profile_id, role, operation, outcome, payload, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now() - interval '1 hour')`,
        [
          staleRun.id,
          staleRun.storyId,
          staleRun.profileId,
          staleRun.role,
          staleRun.operation,
          staleRun.outcome,
          JSON.stringify(staleRun),
        ],
      );
      expect((await createPostgresAgentRunRepository({ pool }).append(recentRun)).ok).toBe(true);

      const report = await reconcile(request, site.api);
      expect(report.ok).toBe(true);
      // No policy ever owned either Story, so there is nothing to abandon but the stale run.
      expect(report.abandonedPolicyRuns).toEqual([]);
      expect(report.abandonedAgentRuns).toEqual([
        {
          id: staleRun.id,
          storyId: stale.storyId,
          role: "assignment_editor",
          operation: "assignment_proposal",
        },
      ]);

      const closed = await readAgentRuns(request, site.api, stale.storyId);
      expect(closed.agentRuns).toEqual([
        expect.objectContaining({
          id: staleRun.id,
          outcome: "failed",
          failure: { code: "MODEL_RUN_ABANDONED", retryable: true },
        }),
      ]);
      const untouched = await readAgentRuns(request, site.api, recent.storyId);
      expect(untouched.agentRuns).toEqual([
        expect.objectContaining({ id: recentRun.id, outcome: "running" }),
      ]);
    } finally {
      await pool.end();
    }
  });
});
