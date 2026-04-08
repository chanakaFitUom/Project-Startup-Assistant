import * as path from "path";
import * as vscode from "vscode";
import { ExtractedCommands, ProjectType } from "../types";
import { ServiceCandidate } from "../detection/projectDetector";

interface PackageJsonLike {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

function hasDependency(pkg: PackageJsonLike, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function detectNodeFramework(pkg: PackageJsonLike | undefined, hasPrisma: boolean): string {
  if (pkg) {
    if (hasDependency(pkg, "next")) {
      return hasPrisma ? "Next.js + Prisma" : "Next.js";
    }
    if (hasDependency(pkg, "vite")) {
      return hasPrisma ? "Vite + Prisma" : "Vite";
    }
    if (hasDependency(pkg, "@sveltejs/kit")) {
      return hasPrisma ? "SvelteKit + Prisma" : "SvelteKit";
    }
    if (hasDependency(pkg, "react-scripts")) {
      return hasPrisma ? "React + Prisma" : "React";
    }
    if (hasDependency(pkg, "@nestjs/core")) {
      return hasPrisma ? "NestJS + Prisma" : "NestJS";
    }
    if (hasDependency(pkg, "express")) {
      return hasPrisma ? "Express + Prisma" : "Express";
    }
  }
  return hasPrisma ? "Prisma" : "Node.js";
}

export function detectPortFromCommand(command?: string): number | undefined {
  if (!command) {
    return undefined;
  }
  const patterns = [
    /--port\s+(\d{2,5})/i,
    /-p\s+(\d{2,5})/i,
    /localhost:(\d{2,5})/i,
    /:(\d{2,5})/
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export class CommandExtractor {
  private async readText(uri: vscode.Uri): Promise<string | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(raw).toString("utf8");
    } catch {
      return undefined;
    }
  }

  private async readPackageJson(servicePath: string): Promise<PackageJsonLike | undefined> {
    const packageUri = vscode.Uri.file(path.join(servicePath, "package.json"));
    const content = await this.readText(packageUri);
    if (!content) {
      return undefined;
    }
    try {
      return JSON.parse(content) as PackageJsonLike;
    } catch {
      return undefined;
    }
  }

  private async detectPackageManager(servicePath: string): Promise<PackageManager> {
    if (await this.readText(vscode.Uri.file(path.join(servicePath, "pnpm-lock.yaml")))) {
      return "pnpm";
    }
    if (await this.readText(vscode.Uri.file(path.join(servicePath, "yarn.lock")))) {
      return "yarn";
    }
    if (await this.readText(vscode.Uri.file(path.join(servicePath, "bun.lockb")))) {
      return "bun";
    }
    return "npm";
  }

  private runScriptCommand(packageManager: PackageManager, scriptName: string): string {
    if (packageManager === "yarn") {
      return `yarn ${scriptName}`;
    }
    if (packageManager === "pnpm") {
      return `pnpm ${scriptName}`;
    }
    if (packageManager === "bun") {
      return `bun run ${scriptName}`;
    }
    return `npm run ${scriptName}`;
  }

  private testScriptCommand(packageManager: PackageManager): string {
    if (packageManager === "yarn") {
      return "yarn test";
    }
    if (packageManager === "pnpm") {
      return "pnpm test";
    }
    if (packageManager === "bun") {
      return "bun test";
    }
    return "npm run test";
  }

  private buildScriptCommand(packageManager: PackageManager): string {
    if (packageManager === "yarn") {
      return "yarn build";
    }
    if (packageManager === "pnpm") {
      return "pnpm build";
    }
    if (packageManager === "bun") {
      return "bun run build";
    }
    return "npm run build";
  }

  private async hasPrismaSchema(servicePath: string): Promise<boolean> {
    return Boolean(await this.readText(vscode.Uri.file(path.join(servicePath, "prisma", "schema.prisma"))));
  }

  private async extractNodeCommands(servicePath: string): Promise<ExtractedCommands> {
    const pkg = await this.readPackageJson(servicePath);
    const packageManager = await this.detectPackageManager(servicePath);
    const scripts = pkg?.scripts ?? {};
    const hasPrisma = (pkg && hasDependency(pkg, "prisma")) || (await this.hasPrismaSchema(servicePath));
    const framework = detectNodeFramework(pkg, Boolean(hasPrisma));
    if (pkg && Object.keys(scripts).length === 0 && !hasPrisma) {
      return { run: "", framework, confidence: "low" };
    }

    const scriptCandidates = ["dev", "start", "serve", "start:dev", "preview"];
    for (const scriptName of scriptCandidates) {
      if (!scripts[scriptName]) {
        continue;
      }
      const test =
        scripts.test ? this.testScriptCommand(packageManager) : hasPrisma ? "npx prisma migrate dev" : undefined;
      const build =
        scripts.build ? this.buildScriptCommand(packageManager) : hasPrisma ? "npx prisma generate" : undefined;
      const runCommand = this.runScriptCommand(packageManager, scriptName);
      return {
        run: runCommand,
        test,
        build,
        framework,
        detectedPort: detectPortFromCommand(scripts[scriptName] ?? runCommand),
        confidence: "high"
      };
    }

    if (pkg) {
      if (hasDependency(pkg, "next") || hasDependency(pkg, "vite") || hasDependency(pkg, "@sveltejs/kit")) {
        const run = this.runScriptCommand(packageManager, "dev");
        return {
          run,
          test: scripts.test ? this.testScriptCommand(packageManager) : undefined,
          build: scripts.build ? this.buildScriptCommand(packageManager) : undefined,
          framework,
          detectedPort: detectPortFromCommand(run),
          confidence: "medium"
        };
      }
      if (hasDependency(pkg, "react-scripts")) {
        const run = packageManager === "npm" ? "npm start" : this.runScriptCommand(packageManager, "start");
        return {
          run,
          test: this.testScriptCommand(packageManager),
          build: this.buildScriptCommand(packageManager),
          framework,
          detectedPort: detectPortFromCommand(run),
          confidence: "medium"
        };
      }
      if (hasDependency(pkg, "@nestjs/core")) {
        const run = this.runScriptCommand(packageManager, "start:dev");
        return {
          run,
          build: this.buildScriptCommand(packageManager),
          framework,
          detectedPort: detectPortFromCommand(run),
          confidence: "medium"
        };
      }
      if (hasDependency(pkg, "express")) {
        return {
          run: "node server.js",
          build: hasPrisma ? "npx prisma generate" : undefined,
          framework,
          confidence: "low"
        };
      }
      if (hasPrisma) {
        return {
          run: "npx prisma studio",
          build: "npx prisma generate",
          test: "npx prisma migrate status",
          framework: "Prisma",
          detectedPort: 5555,
          confidence: "medium"
        };
      }
    }

    const run = this.runScriptCommand(packageManager, "dev");
    return { run, framework, detectedPort: detectPortFromCommand(run), confidence: "low" };
  }

  private async extractPythonCommands(servicePath: string): Promise<ExtractedCommands> {
    const requirementsContent = await this.readText(vscode.Uri.file(path.join(servicePath, "requirements.txt")));
    const pyprojectContent = await this.readText(vscode.Uri.file(path.join(servicePath, "pyproject.toml")));
    const pipfileContent = await this.readText(vscode.Uri.file(path.join(servicePath, "Pipfile")));

    const combined = `${requirementsContent ?? ""}\n${pyprojectContent ?? ""}\n${pipfileContent ?? ""}`.toLowerCase();
    if (combined.includes("django")) {
      return { run: "python manage.py runserver", test: "python manage.py test", framework: "Django", detectedPort: 8000, confidence: "high" };
    }
    if (combined.includes("fastapi")) {
      return { run: "uvicorn app:app --reload", framework: "FastAPI", detectedPort: 8000, confidence: "high" };
    }
    if (combined.includes("flask")) {
      return { run: "flask run", framework: "Flask", detectedPort: 5000, confidence: "high" };
    }

    if (await this.readText(vscode.Uri.file(path.join(servicePath, "manage.py")))) {
      return { run: "python manage.py runserver", framework: "Django", detectedPort: 8000, confidence: "high" };
    }
    if (await this.readText(vscode.Uri.file(path.join(servicePath, "main.py")))) {
      return { run: "python main.py", framework: "Python", confidence: "medium" };
    }
    if (await this.readText(vscode.Uri.file(path.join(servicePath, "app.py")))) {
      return { run: "python app.py", framework: "Python", confidence: "medium" };
    }

    return { run: "python main.py", framework: "Python", confidence: "low" };
  }

  public static inferByProjectType(projectType: ProjectType, markerFiles: string[]): ExtractedCommands {
    switch (projectType) {
      case "java":
        if (markerFiles.includes("build.gradle")) {
          return { run: "gradle bootRun", build: "gradle build", framework: "Spring Boot", detectedPort: 8080, confidence: "high" };
        }
        return { run: "mvn spring-boot:run", build: "mvn package", framework: "Spring Boot", detectedPort: 8080, confidence: "high" };
      case "dotnet":
        return { run: "dotnet run", test: "dotnet test", build: "dotnet build", framework: ".NET", confidence: "high" };
      case "go":
        return { run: markerFiles.includes("main.go") ? "go run main.go" : "go run .", test: "go test ./...", build: "go build ./...", framework: "Go", confidence: "high" };
      case "rust":
        return { run: "cargo run", test: "cargo test", build: "cargo build", framework: "Rust", confidence: "high" };
      case "php":
        return { run: "php -S localhost:8000 -t public", test: "phpunit", build: "composer install", framework: "PHP", detectedPort: 8000, confidence: "medium" };
      case "ruby":
        return { run: "bundle exec rails server", test: "bundle exec rspec", build: "bundle install", framework: "Ruby on Rails", detectedPort: 3000, confidence: "medium" };
      case "elixir":
        return { run: "mix phx.server", test: "mix test", build: "mix deps.get", framework: "Phoenix", detectedPort: 4000, confidence: "medium" };
      case "docker":
        if (markerFiles.includes("docker-compose.yml") || markerFiles.includes("docker-compose.yaml")) {
          return { run: "docker compose up", build: "docker compose build", framework: "Docker Compose", confidence: "high" };
        }
        return { run: "docker build .", framework: "Docker", confidence: "medium" };
      default:
        return { run: "", confidence: "low" };
    }
  }

  public async extract(candidate: ServiceCandidate): Promise<ExtractedCommands> {
    if (candidate.projectType === "node") {
      return this.extractNodeCommands(candidate.absolutePath);
    }
    if (candidate.projectType === "python") {
      return this.extractPythonCommands(candidate.absolutePath);
    }
    return CommandExtractor.inferByProjectType(candidate.projectType, candidate.markerFiles);
  }
}
