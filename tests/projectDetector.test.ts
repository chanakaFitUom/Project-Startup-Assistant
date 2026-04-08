import { describe, expect, it } from "vitest";
import { detectProjectTypeFromMarkers } from "../src/detection/projectDetector";

describe("detectProjectTypeFromMarkers", () => {
  it("detects dotnet from csproj marker", () => {
    expect(detectProjectTypeFromMarkers(["WebApi.csproj"])).toBe("dotnet");
  });

  it("detects python from pyproject markers", () => {
    expect(detectProjectTypeFromMarkers(["pyproject.toml"])).toBe("python");
  });
});
