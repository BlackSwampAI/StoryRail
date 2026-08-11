export interface AssignmentEditorRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterApiKey: string;
  readonly model: string;
}

export type AssignmentEditorConfigurationErrorCode =
  | "STORYRAIL_DATABASE_URL_REQUIRED"
  | "OPENROUTER_API_KEY_REQUIRED"
  | "STORYRAIL_ASSIGNMENT_EDITOR_MODEL_REQUIRED";

export class AssignmentEditorRuntimeConfigurationError extends Error {
  constructor(readonly code: AssignmentEditorConfigurationErrorCode) {
    const variable =
      code === "STORYRAIL_DATABASE_URL_REQUIRED"
        ? "STORYRAIL_DATABASE_URL"
        : code === "OPENROUTER_API_KEY_REQUIRED"
          ? "OPENROUTER_API_KEY"
          : "STORYRAIL_ASSIGNMENT_EDITOR_MODEL";
    super(`${variable} is required.`);
    this.name = "AssignmentEditorRuntimeConfigurationError";
  }
}

function required(
  environment: NodeJS.ProcessEnv,
  variable: "STORYRAIL_DATABASE_URL" | "OPENROUTER_API_KEY" | "STORYRAIL_ASSIGNMENT_EDITOR_MODEL",
  code: AssignmentEditorConfigurationErrorCode,
): string {
  const value = environment[variable];
  if (value === undefined || value.trim().length === 0) {
    throw new AssignmentEditorRuntimeConfigurationError(code);
  }
  return value;
}

export function loadAssignmentEditorRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): AssignmentEditorRuntimeConfiguration {
  return Object.freeze({
    databaseUrl: required(environment, "STORYRAIL_DATABASE_URL", "STORYRAIL_DATABASE_URL_REQUIRED"),
    openRouterApiKey: required(environment, "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_REQUIRED"),
    model: required(
      environment,
      "STORYRAIL_ASSIGNMENT_EDITOR_MODEL",
      "STORYRAIL_ASSIGNMENT_EDITOR_MODEL_REQUIRED",
    ),
  });
}
