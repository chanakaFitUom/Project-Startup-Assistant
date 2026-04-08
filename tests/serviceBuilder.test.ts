import { describe, expect, it } from "vitest";
import { buildDetectedServices, preserveRuntimeState } from "../src/services/serviceBuilder";
import { ServiceCandidate } from "../src/detection/projectDetector";
import { ServiceDefinition } from "../src/types";

describe("serviceBuilder", () => {
  it("builds detected services from candidates and extracted commands", () => {
    const candidates: ServiceCandidate[] = [
      {
        id: "frontend",
        name: "Frontend",
        absolutePath: "/tmp/frontend",
        relativePath: "frontend",
        projectType: "node",
        markerFiles: ["package.json"]
      }
    ];

    const result = buildDetectedServices(candidates, {
      frontend: {
        run: "npm run dev",
        framework: "Next.js",
        detectedPort: 3000,
        confidence: "high"
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0].command).toBe("npm run dev");
    expect(result[0].framework).toBe("Next.js");
  });

  it("preserves running state during refresh when terminal exists", () => {
    const current: ServiceDefinition[] = [
      {
        id: "frontend",
        name: "Frontend",
        path: "frontend",
        command: "npm run dev",
        projectType: "node",
        source: "auto",
        status: "stopped",
        health: "unknown"
      }
    ];
    const previous: ServiceDefinition[] = [
      {
        id: "frontend",
        name: "Frontend",
        path: "frontend",
        command: "npm run dev",
        projectType: "node",
        source: "auto",
        status: "running",
        health: "healthy"
      }
    ];
    const next = preserveRuntimeState(current, previous, () => true);
    expect(next[0].status).toBe("running");
  });
});
