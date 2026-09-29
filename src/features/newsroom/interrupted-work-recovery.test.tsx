import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InterruptedWorkClient, InterruptedWorkResult } from "./interrupted-work-client";
import { InterruptedWorkRecovery } from "./interrupted-work-recovery";

function renderRecovery(result: Promise<InterruptedWorkResult> | InterruptedWorkResult) {
  const recover = vi.fn(() => Promise.resolve(result));
  const requests: InterruptedWorkClient = { recover };
  render(<InterruptedWorkRecovery requests={requests} />);
  return recover;
}

const recovered = (recovery: {
  policyRuns?: number;
  agentRuns?: number;
  toolCalls?: number;
  deliveries?: Extract<InterruptedWorkResult, { kind: "completed" }>["recovery"]["deliveries"];
}): InterruptedWorkResult => ({
  kind: "completed",
  recovery: { policyRuns: 0, agentRuns: 0, toolCalls: 0, deliveries: [], ...recovery },
});

describe("recovering interrupted work", () => {
  it("does nothing until an operator asks", () => {
    const recover = renderRecovery(recovered({}));

    expect(screen.getByRole("button", { name: "Recover interrupted work" })).toBeEnabled();
    expect(recover).not.toHaveBeenCalled();
  });

  it("says what it closed and that nothing was resumed or sent again", async () => {
    const recover = renderRecovery(recovered({ policyRuns: 1, agentRuns: 2, toolCalls: 3 }));

    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted work" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Closed 1 automation, 2 agent runs, 3 tool calls and 0 deliveries. Nothing was resumed or sent again.",
    );
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("names each delivery left unknown and sends the operator to reconcile it", async () => {
    renderRecovery(
      recovered({
        deliveries: [
          {
            id: "delivery-1",
            storyId: "story-1",
            destination: "wordpress",
            operation: "update",
            slug: "a-stuck-delivery",
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted work" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("1 delivery");
    expect(status).toHaveTextContent("may or may not have reached their destination");
    expect(status).toHaveTextContent("Update of a-stuck-delivery to wordpress, Story story-1");
    // Unknown, not failed: a failure would invite a retry that duplicates the page.
    expect(status).not.toHaveTextContent(/failed/i);
  });

  it("says plainly when nothing was stuck", async () => {
    renderRecovery(recovered({}));

    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted work" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Nothing was stuck.");
  });

  it("stays disabled while a pass is running so it cannot be asked twice", async () => {
    let finish: (result: InterruptedWorkResult) => void = () => undefined;
    const recover = renderRecovery(
      new Promise<InterruptedWorkResult>((resolve) => {
        finish = resolve;
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted work" }));

    const busy = await screen.findByRole("button", { name: "Recovering…" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(recover).toHaveBeenCalledTimes(1);

    finish(recovered({}));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recover interrupted work" })).toBeEnabled(),
    );
  });

  it("reports an unavailable server without claiming anything changed", async () => {
    renderRecovery({
      kind: "unavailable",
      message: "Interrupted work could not be recovered. Nothing is known to have changed.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Recover interrupted work" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Interrupted work could not be recovered.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
