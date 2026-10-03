import { newsroomStandardsId, operatorId, type EditorialContextSnapshot } from "@/domain/editorial";

/** A fictional publication with explicit reader value, used to prove exact prompt/run capture. */
export const HARBOUR_EDITORIAL_CONTEXT: EditorialContextSnapshot = {
  identity: {
    name: "Harbour Ledger",
    description: "Practical local reporting for people in the harbour district.",
  },
  standards: {
    id: newsroomStandardsId("standards-harbour-1"),
    revisionNumber: 1,
    text: "Use direct, sentence-case headlines.",
    brief: {
      audience: "Harbour district residents",
      readerBenefit: "Know what changed and what to do next.",
      coverageCriteria: "Local services and decisions that affect residents.",
      voice: "Direct and calm.",
      avoid: "Speculation about causes.",
    },
    updatedBy: { type: "operator", operatorId: operatorId("editorial-test-operator") },
    updatedAt: "2026-09-01T09:00:00.000Z",
  },
};

/** A contrasting audience keeps tests from passing with a generic or cross-Site brief. */
export const ENGINEERING_EDITORIAL_CONTEXT: EditorialContextSnapshot = {
  identity: {
    name: "Engineering Field Notes",
    description: "Verified software release guidance for working engineers.",
  },
  standards: {
    id: newsroomStandardsId("standards-engineering-1"),
    revisionNumber: 1,
    text: "Use precise terms and explain migration steps.",
    brief: {
      audience: "Working software engineers",
      readerBenefit: "Understand the documented compatibility impact.",
      coverageCriteria: "Verified release changes and migration steps.",
      voice: "Precise and practical.",
      avoid: "Unverified performance claims.",
    },
    updatedBy: { type: "operator", operatorId: operatorId("editorial-test-operator") },
    updatedAt: "2026-09-01T09:00:00.000Z",
  },
};
