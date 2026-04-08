import { describe, expect, it } from "vitest";
import { buildDetectedServices, preserveRuntimeState } from "../src/services/serviceBuilder";
import { ServiceCandidate } from "../src/detection/projectDetector";

describe("refresh pipeline smoke", () => {
  it("keeps service list stable from detect -> build -> preserve", () => {
    const candidates: ServiceCandidate[] = [
      {
        id: "backend",
        name: "Backend",
        absolutePath: "/workspace/backend",
        relativePath: "backend",
        projectType: "node",
        markerFiles: ["package.json"]
      },
      {
        id: "frontend",
        name: "Frontend",
        absolutePath: "/workspace/frontend",
        relativePath: "frontend",
        projectType: "node",
        markerFiles: ["package.json"]
      }
    ];

    const detected = buildDetectedServices(candidates, {
      backend: { run: "npm run dev", confidence: "high" },
      frontend: { run: "npm run dev", confidence: "high" }
    });

    const previous = [{ ...detected[0], status: "running" as const, health: "healthy" as const }, detected[1]];
    const preserved = preserveRuntimeState(detected, previous, (id) => id === detected[0].id);

    expect(preserved).toHaveLength(2);
    expect(preserved[0].status).toBe("running");
    expect(preserved[1].status).toBe("stopped");
  });
});
