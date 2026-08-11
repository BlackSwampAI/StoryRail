import {
  createReferenceAgentProfileRepository,
  describeAgentProfileRepositoryContract,
} from "./agent-profile-repository.contract";

describeAgentProfileRepositoryContract(() => createReferenceAgentProfileRepository());
