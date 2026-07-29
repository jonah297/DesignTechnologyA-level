import { vi } from "vitest";

globalThis.jest = {
  setTimeout: (timeout) => vi.setConfig({ testTimeout: timeout }),
};
