import { describe, expect, it } from "vitest";
import { CommandExtractor, detectPortFromCommand } from "../src/commands/commandExtractor";

describe("CommandExtractor helpers", () => {
  it("infers gradle spring run for java + build.gradle", () => {
    const result = CommandExtractor.inferByProjectType("java", ["build.gradle"]);
    expect(result.run).toBe("gradle bootRun");
    expect(result.framework).toBe("Spring Boot");
  });

  it("infers docker compose commands when compose file exists", () => {
    const result = CommandExtractor.inferByProjectType("docker", ["docker-compose.yml"]);
    expect(result.run).toBe("docker compose up");
    expect(result.build).toBe("docker compose build");
  });

  it("extracts port from command line options", () => {
    expect(detectPortFromCommand("vite --port 5173")).toBe(5173);
  });

  it("keeps framework identity in node inference path", () => {
    const result = CommandExtractor.inferByProjectType("docker", ["docker-compose.yaml"]);
    expect(result.framework).toBe("Docker Compose");
  });
});
