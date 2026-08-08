import type { EditorialActor, SourceId } from "./types";

declare const canonicalSourceUrlBrand: unique symbol;

export type CanonicalSourceUrl = string & {
  readonly [canonicalSourceUrlBrand]: "CanonicalSourceUrl";
};

export interface UrlSource {
  readonly id: SourceId;
  readonly type: "url";
  readonly submittedUrl: string;
  readonly canonicalUrl: CanonicalSourceUrl;
  readonly submittedBy: EditorialActor;
  readonly receivedAt: string;
}

export interface IntakeUrlSourceCommand {
  readonly sourceId: SourceId;
  readonly submittedUrl: string;
  readonly submittedBy: EditorialActor;
  readonly receivedAt: string;
}

export interface SourceUrlRequiredError {
  readonly code: "SOURCE_URL_REQUIRED";
  readonly message: string;
}

export interface SourceUrlTooLongError {
  readonly code: "SOURCE_URL_TOO_LONG";
  readonly message: string;
  readonly maximumLength: number;
}

export interface InvalidSourceUrlError {
  readonly code: "INVALID_SOURCE_URL";
  readonly message: string;
}

export interface UnsupportedSourceProtocolError {
  readonly code: "UNSUPPORTED_SOURCE_PROTOCOL";
  readonly message: string;
}

export interface SourceUrlCredentialsNotAllowedError {
  readonly code: "SOURCE_URL_CREDENTIALS_NOT_ALLOWED";
  readonly message: string;
}

export type SourceUrlValidationError =
  | SourceUrlRequiredError
  | SourceUrlTooLongError
  | InvalidSourceUrlError
  | UnsupportedSourceProtocolError
  | SourceUrlCredentialsNotAllowedError;

export interface DuplicateSourceError {
  readonly code: "DUPLICATE_SOURCE";
  readonly message: string;
  readonly existingSourceId: SourceId;
  readonly canonicalUrl: CanonicalSourceUrl;
}

export type SourceIntakeError = SourceUrlValidationError | DuplicateSourceError;

export interface CanonicalizeSourceUrlSuccess {
  readonly ok: true;
  readonly canonicalUrl: CanonicalSourceUrl;
}

export interface CanonicalizeSourceUrlFailure {
  readonly ok: false;
  readonly error: SourceUrlValidationError;
}

export type CanonicalizeSourceUrlResult =
  CanonicalizeSourceUrlSuccess | CanonicalizeSourceUrlFailure;

export interface IntakeUrlSourceSuccess {
  readonly ok: true;
  readonly source: UrlSource;
}

export interface IntakeUrlSourceFailure {
  readonly ok: false;
  readonly error: SourceIntakeError;
}

export type IntakeUrlSourceResult = IntakeUrlSourceSuccess | IntakeUrlSourceFailure;
