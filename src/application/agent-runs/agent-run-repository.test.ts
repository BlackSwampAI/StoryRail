import {
  createReferenceAgentRunRepository,
  describeAgentRunRepositoryContract,
} from "./agent-run-repository.contract";

describeAgentRunRepositoryContract(createReferenceAgentRunRepository);
