import { ServiceCandidate } from "../detection/projectDetector";
import { ExtractedCommands, ServiceDefinition } from "../types";

function slugify(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").toLowerCase();
}

export function buildDetectedServices(
  candidates: ServiceCandidate[],
  extractedById: Record<string, ExtractedCommands>
): ServiceDefinition[] {
  const services: ServiceDefinition[] = [];
  for (const candidate of candidates) {
    const extracted = extractedById[candidate.id];
    if (!extracted || !extracted.run) {
      continue;
    }
    services.push({
      id: slugify(candidate.relativePath),
      name: candidate.name,
      path: candidate.relativePath || ".",
      command: extracted.run,
      framework: extracted.framework,
      detectedPort: extracted.detectedPort,
      testCommand: extracted.test,
      buildCommand: extracted.build,
      projectType: candidate.projectType,
      source: "auto",
      status: "stopped",
      health: "unknown",
      confidence: extracted.confidence,
      enabled: true
    });
  }
  return services;
}

export function preserveRuntimeState(
  currentServices: ServiceDefinition[],
  previousServices: ServiceDefinition[],
  hasTerminalById: (serviceId: string) => boolean
): ServiceDefinition[] {
  const runningIds = new Set(
    previousServices
      .filter((service) => service.status === "running" && hasTerminalById(service.id))
      .map((service) => service.id)
  );
  return currentServices.map((service) => {
    if (!runningIds.has(service.id)) {
      return service;
    }
    return {
      ...service,
      status: "running",
      health: service.health === "unknown" ? "starting" : service.health
    };
  });
}
