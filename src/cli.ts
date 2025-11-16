#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { resolveSafeVersion } from "./resolver.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
}

interface Failure {
  name: string;
  range: string;
  reason: string;
}

const DEFAULT_REGISTRY = "https://registry.npmjs.org";

const program = new Command();

program.name("safe-npm").description("Install npm dependencies with a minimum publish age");

program
  .command("install [packages...]", { isDefault: true })
  .option("--min-age-days <n>", "minimum publish age in days", "90")
  .option("--registry <url>", "npm registry to query", DEFAULT_REGISTRY)
  .option("--dry-run", "show planned versions without installing", false)
  .option("--strict", "exit with error when a dependency cannot be resolved", false)
  .option("--dev", "only target devDependencies from package.json", false)
  .option("--prod-only", "only target dependencies from package.json", false)
  .option("--ignore <list>", "comma-separated packages to bypass age checks", "")
  .option("--strategy <strategy>", "direct|overrides installation strategy", "direct")
  .action(async (packages: string[], options) => {
    const minAgeDays = Number(options.minAgeDays);
    if (Number.isNaN(minAgeDays) || minAgeDays < 0) {
      console.error("--min-age-days must be a non-negative number");
      process.exit(1);
    }

    const registry = options.registry || DEFAULT_REGISTRY;
    const cutOffMs = minAgeDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - cutOffMs);
    const ignoreSet = buildIgnoreSet(options.ignore);

    const devOnly = Boolean(options.dev);
    const prodOnly = Boolean(options.prodOnly);

    if (devOnly && prodOnly) {
      console.error("--dev and --prod-only cannot be used together.");
      process.exit(1);
    }

    const dependencyMap = packages.length > 0 ? collectFromArgs(packages) : collectFromPackageJson({ devOnly, prodOnly });

    if (dependencyMap.size === 0) {
      console.log("No dependencies to process.");
      process.exit(0);
    }

    console.log(`Using minimum age of ${minAgeDays} days (cutoff ${cutoffDate.toISOString()}).`);

    const resolved = new Map<string, string>();
    const failures: Failure[] = [];

    for (const [name, range] of dependencyMap.entries()) {
      try {
        const version = await resolveSafeVersion({
          name,
          range,
          registry,
          cutoffDate,
          ignoreAge: ignoreSet.has(name),
        });

        if (!version) {
          failures.push({ name, range, reason: "No version satisfies the range and age requirement" });
          continue;
        }

        resolved.set(name, version);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        failures.push({ name, range, reason });
      }
    }

    if (failures.length > 0) {
      console.log("\nDependencies that could not be resolved safely:");
      for (const failure of failures) {
        console.log(`  - ${failure.name}@${failure.range}: ${failure.reason}`);
      }
      if (options.strict) {
        process.exit(1);
      }
    }

    if (resolved.size === 0) {
      console.log("\nNo dependencies qualified for installation.");
      process.exit(options.strict && failures.length > 0 ? 1 : 0);
    }

    console.log("\nSafe versions to install:");
    for (const [name, version] of resolved.entries()) {
      const ignoredLabel = ignoreSet.has(name) ? " (ignored)" : "";
      console.log(`  ${name}@${version}${ignoredLabel}`);
    }

    if (options.dryRun) {
      console.log("\nDry run enabled. No changes were made.");
      process.exit(0);
    }

    const strategy = typeof options.strategy === "string" ? options.strategy.toLowerCase() : "direct";
    await runStrategy(strategy, resolved, registry);
  });

program.parseAsync(process.argv).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

function buildIgnoreSet(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map(token => token.trim())
      .filter(token => token.length > 0)
  );
}

function collectFromArgs(specs: string[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const spec of specs) {
    const { name, range } = parsePackageSpec(spec);
    map.set(name, range);
  }

  return map;
}

function collectFromPackageJson(options: { devOnly: boolean; prodOnly: boolean }): Map<string, string> {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error("No package.json found in the current directory.");
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
  const map = new Map<string, string>();

  if (!options.prodOnly) {
    Object.entries(pkg.devDependencies ?? {}).forEach(([name, range]) => map.set(name, range));
  }

  if (!options.devOnly) {
    Object.entries(pkg.dependencies ?? {}).forEach(([name, range]) => map.set(name, range));
  }

  return map;
}

function parsePackageSpec(spec: string): { name: string; range: string } {
  if (!spec) {
    throw new Error("Empty package spec provided");
  }

  if (spec.startsWith("@")) {
    const atIndex = spec.indexOf("@", 1);
    if (atIndex === -1) {
      return { name: spec, range: "latest" };
    }
    return { name: spec.slice(0, atIndex), range: spec.slice(atIndex + 1) || "latest" };
  }

  const lastAt = spec.lastIndexOf("@");
  if (lastAt > 0) {
    return { name: spec.slice(0, lastAt), range: spec.slice(lastAt + 1) || "latest" };
  }

  return { name: spec, range: "latest" };
}

async function runStrategy(strategy: string, resolved: Map<string, string>, registry: string): Promise<void> {
  if (strategy === "direct") {
    const npmArgs = ["install", ...Array.from(resolved.entries()).map(([name, version]) => `${name}@${version}`)];
    npmArgs.push("--registry", registry);
    console.log(`\nRunning: npm ${npmArgs.join(" ")}`);
    const result = spawnSync("npm", npmArgs, { stdio: "inherit" });
    process.exit(result.status ?? 1);
  }

  if (strategy === "overrides") {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (!fs.existsSync(pkgPath)) {
      console.error("Cannot use overrides strategy without a package.json in the current directory.");
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
    pkg.overrides = { ...(pkg.overrides ?? {}), ...Object.fromEntries(resolved.entries()) };
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log("\nUpdated package.json overrides. Running npm install...");
    const npmArgs = ["install", "--registry", registry];
    const result = spawnSync("npm", npmArgs, { stdio: "inherit" });
    process.exit(result.status ?? 1);
  }

  console.error(`Unknown strategy: ${strategy}`);
  process.exit(1);
}
