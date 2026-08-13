import { DragDropProvider } from "@dnd-kit/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { agentProfileId, type AgentProfile } from "@/domain/editorial";

import { NewsroomStaff } from "./newsroom-staff";

const PROFILES = [
  {
    id: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    name: "Assignment Editor",
    instructions: "Prepare a grounded assignment.",
    model: { provider: "openrouter", model: "editor/model" },
    builtIn: true,
  },
  {
    id: agentProfileId("storyrail-general-writer-v1"),
    role: "writer",
    name: "General Writer",
    instructions: "Write from evidence only.",
    model: null,
    builtIn: true,
  },
  {
    id: agentProfileId("custom-writer-33"),
    role: "writer",
    name: "New Writer",
    instructions: "Use a crisp explanatory voice.",
    model: { provider: "openrouter", model: "muse/glimmer-30b" },
    builtIn: false,
  },
  {
    id: agentProfileId("storyrail-director-v1"),
    role: "editor_in_chief",
    name: "Director",
    instructions: "Supervise editorial direction.",
    model: null,
    builtIn: true,
  },
] satisfies readonly AgentProfile[];

describe("NewsroomStaff", () => {
  it("renders durable Profile facts while exposing drag handles only for Writers", () => {
    const onOpenAgents = vi.fn();
    render(
      <DragDropProvider>
        <NewsroomStaff
          state={{ kind: "loaded", profiles: PROFILES }}
          onRetry={vi.fn()}
          onOpenAgents={onOpenAgents}
        />
      </DragDropProvider>,
    );

    expect(screen.getByText("Assignment Editor · Built in")).toBeVisible();
    expect(screen.getByText("Director · Editor-in-Chief · Built in")).toBeVisible();
    expect(screen.getByText("Writer · Custom")).toBeVisible();
    expect(screen.getAllByText("Newsroom default")).toHaveLength(2);
    expect(screen.getByText("muse/glimmer-30b")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Drag General Writer to an Assignment" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Drag New Writer to an Assignment" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Drag Assignment Editor/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Drag Director/ })).not.toBeInTheDocument();

    const writerCard = screen.getByRole("heading", { name: "General Writer" }).closest("article");
    expect(writerCard).not.toBeNull();
    fireEvent.click(within(writerCard!).getByText("Profile details"));
    expect(within(writerCard!).getByText("Write from evidence only.")).toBeVisible();
    expect(within(writerCard!).getByText("Newsroom default at execution")).toBeVisible();
    expect(within(writerCard!).getByText("storyrail-general-writer-v1")).toBeVisible();
    fireEvent.click(within(writerCard!).getByRole("button", { name: "Open in Agents" }));
    expect(onOpenAgents).toHaveBeenCalledOnce();
    expect(screen.queryByText(/api key|credential|secret/i)).not.toBeInTheDocument();
  });

  it("keeps Profile failure compact and retryable", () => {
    const onRetry = vi.fn();
    render(
      <DragDropProvider>
        <NewsroomStaff state={{ kind: "unavailable" }} onRetry={onRetry} onOpenAgents={vi.fn()} />
      </DragDropProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Staff unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
