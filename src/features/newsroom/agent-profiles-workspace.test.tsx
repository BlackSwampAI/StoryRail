import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { agentProfileId, type AgentProfile } from "@/domain/editorial";

import type { AgentProfileClient } from "./agent-profile-client";
import { AgentProfilesWorkspace } from "./agent-profiles-workspace";

const builtIns = [
  {
    id: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    name: "Assignment Editor",
    instructions: "Assess evidence and editorial value.",
    model: null,
    builtIn: true,
  },
  {
    id: agentProfileId("storyrail-general-writer-v1"),
    role: "writer",
    name: "General Writer",
    instructions: "Write within scope.",
    model: null,
    builtIn: true,
  },
  {
    id: agentProfileId("storyrail-director-v1"),
    role: "editor_in_chief",
    name: "Director",
    instructions: "Review independently.",
    model: null,
    builtIn: true,
  },
  {
    id: agentProfileId("configured-writer"),
    role: "writer",
    name: "Configured Writer",
    instructions: "Write with the configured model when a future Assignment uses this profile.",
    model: { provider: "provider", model: "review-model" },
    builtIn: false,
  },
] satisfies readonly AgentProfile[];

function client(overrides: Partial<AgentProfileClient> = {}): AgentProfileClient {
  return {
    listProfiles: vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
      kind: "completed",
      value: builtIns,
    })),
    createWriterProfile: vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
      kind: "unavailable",
      message: "The Agent Profile request could not be completed.",
    })),
    ...overrides,
  };
}

describe("AgentProfilesWorkspace", () => {
  it("loads built-in profiles with truthful status and model configuration", async () => {
    render(<AgentProfilesWorkspace requests={client()} />);
    expect(await screen.findByRole("heading", { name: "Assignment Editor" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "General Writer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Director" })).toBeVisible();
    expect(screen.getAllByText("Built-in")).toHaveLength(3);
    expect(screen.getAllByText("Newsroom default at execution")).toHaveLength(3);
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
    expect(screen.getByText("provider / review-model")).toBeVisible();
    expect(screen.getByText("No agents are running")).toBeVisible();
  });

  it("offers a link from the profile grid to the creation form it actually has", async () => {
    render(<AgentProfilesWorkspace requests={client()} />);
    const link = await screen.findByRole("link", { name: /New Writer profile/ });

    // A link, not a button: creating a Writer happens in the form at the foot of this page and
    // nowhere else, so the affordance must go there rather than imply a dialog that does not exist.
    expect(link).toHaveAttribute("href", "#create-writer-profile");
    expect(
      screen.getByRole("heading", { name: "Create Writer profile" }).closest("form"),
    ).toHaveAttribute("id", "create-writer-profile");
  });

  it("posts exact no-model configuration and shows the authoritative created profile without reload", async () => {
    const created = {
      id: agentProfileId("custom-workspace-0027"),
      role: "writer",
      name: "Custom Writer",
      instructions: "Use a specialist angle.",
      model: null,
      builtIn: false,
    } satisfies AgentProfile;
    const createWriterProfile = vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
      kind: "completed",
      value: created,
    }));
    const onProfileCreated = vi.fn();
    render(
      <AgentProfilesWorkspace
        requests={client({ createWriterProfile })}
        onProfileCreated={onProfileCreated}
      />,
    );
    await screen.findByRole("heading", { name: "General Writer" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Custom Writer" } });
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Use a specialist angle." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Writer profile" }));

    expect(await screen.findByRole("heading", { name: "Custom Writer" })).toBeVisible();
    expect(createWriterProfile).toHaveBeenCalledWith({
      name: "Custom Writer",
      instructions: "Use a specialist angle.",
      model: null,
    });
    expect(screen.getByRole("heading", { name: "General Writer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Custom Writer" })).toBeVisible();
    expect(onProfileCreated).toHaveBeenCalledOnce();
    expect(onProfileCreated).toHaveBeenCalledWith(created);
  });

  it("posts provider and model together", async () => {
    const createWriterProfile = vi.fn<AgentProfileClient["createWriterProfile"]>(async (input) => ({
      kind: "completed",
      value: {
        id: agentProfileId("configured-workspace"),
        role: "writer",
        name: input.name,
        instructions: input.instructions,
        model: input.model,
        builtIn: false,
      },
    }));
    render(<AgentProfilesWorkspace requests={client({ createWriterProfile })} />);
    await screen.findByRole("heading", { name: "General Writer" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Model Writer" } });
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Stay grounded." },
    });
    fireEvent.change(screen.getByLabelText("Provider (optional)"), {
      target: { value: "provider" },
    });
    fireEvent.change(screen.getByLabelText("Model identifier (optional)"), {
      target: { value: "model-id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Writer profile" }));
    await waitFor(() =>
      expect(createWriterProfile).toHaveBeenCalledWith({
        name: "Model Writer",
        instructions: "Stay grounded.",
        model: { provider: "provider", model: "model-id" },
      }),
    );
    expect(await screen.findByText("provider / model-id")).toBeVisible();
  });

  it("rejects a partial model pair locally and never invents persistence after failure", async () => {
    const createWriterProfile = vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
      kind: "unavailable",
      message: "The Agent Profile request could not be completed.",
    }));
    render(<AgentProfilesWorkspace requests={client({ createWriterProfile })} />);
    await screen.findByRole("heading", { name: "General Writer" });
    fireEvent.change(screen.getByLabelText("Provider (optional)"), {
      target: { value: "provider" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Writer profile" }));
    expect(screen.getByText(/must both be supplied/)).toBeVisible();
    expect(createWriterProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved Writer" } });
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Unsaved." } });
    fireEvent.change(screen.getByLabelText("Model identifier (optional)"), {
      target: { value: "model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Writer profile" }));
    expect(
      await screen.findByText("The Agent Profile request could not be completed."),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Unsaved Writer" })).not.toBeInTheDocument();
  });

  it("uses each reload/list response as authoritative", async () => {
    const listProfiles = vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
      kind: "completed",
      value: builtIns,
    }));
    const view = render(<AgentProfilesWorkspace requests={client({ listProfiles })} />);
    await screen.findByRole("heading", { name: "Director" });
    view.unmount();
    render(<AgentProfilesWorkspace requests={client({ listProfiles })} />);
    await screen.findByRole("heading", { name: "Director" });
    expect(listProfiles).toHaveBeenCalledTimes(2);
    const header = screen.getByRole("heading", { name: "Agent Profiles" }).parentElement;
    if (header === null) throw new Error("The Agent Profiles heading must have a header.");
    expect(within(header).getByText(/future Assignments/)).toBeVisible();
  });
});
