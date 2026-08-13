import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserverStub implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      void callback;
    }

    observe(target: Element, options?: ResizeObserverOptions): void {
      void target;
      void options;
    }
    unobserve(target: Element): void {
      void target;
    }
    disconnect(): void {}
  };
}

afterEach(() => {
  cleanup();
});
