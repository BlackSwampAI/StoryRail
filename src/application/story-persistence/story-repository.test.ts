import {
  createReferenceStoryRepository,
  describeStoryRepositoryContract,
} from "./story-repository.contract";

describeStoryRepositoryContract(createReferenceStoryRepository);
