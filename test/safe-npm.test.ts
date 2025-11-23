import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import semver from "semver";

interface RegistryPackage {
  name: string;
  versions: Record<string, Record<string, unknown>>;
  time: Record<string, string>;
  "dist-tags": Record<string, string>;
}

const CLI_PATH = path.resolve(process.cwd(), "dist/cli.js");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe("safe-npm CLI integration", () => {
  it("resolves the newest safe versions for cli arguments", () => {
    const fixture = createFixtureFile({
      alpha: createPackage("alpha", {
        "1.0.0": isoDaysAgo(400),
        "1.1.0": isoDaysAgo(150),
        "1.2.0": isoDaysAgo(20)
      }),
      beta: createPackage("beta", {
        "2.0.0": isoDaysAgo(200),
        "2.1.0": isoDaysAgo(95),
        "2.2.0": isoDaysAgo(5)
      })
    });

    try {
      const result = runCli(["install", "alpha", "beta@^2", "--dry-run"], {
        env: { SAFE_NPM_FIXTURES: fixture.path }
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("alpha@1.1.0");
      expect(result.stdout).toContain("beta@2.1.0");
    } finally {
      fixture.cleanup();
    }
  });

  it("fails fast in strict mode when no versions meet the cutoff", () => {
    const fixture = createFixtureFile({
      recent: createPackage("recent", {
        "1.0.0": isoDaysAgo(15),
        "1.1.0": isoDaysAgo(5)
      })
    });

    try {
      const result = runCli(["install", "recent", "--dry-run", "--strict"], {
        env: { SAFE_NPM_FIXTURES: fixture.path }
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("could not be resolved safely");
    } finally {
      fixture.cleanup();
    }
  });

  it("loads dependencies from package.json and honors the ignore list", () => {
    const fixture = createFixtureFile({
      alpha: createPackage("alpha", {
        "1.1.0": isoDaysAgo(7)
      }),
      beta: createPackage("beta", {
        "2.0.0": isoDaysAgo(220)
      })
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-npm-test-"));
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          version: "1.0.0",
          dependencies: { alpha: "latest" },
          devDependencies: { beta: "^2.0.0" }
        },
        null,
        2
      )
    );

    try {
      const result = runCli(["install", "--dry-run", "--ignore", "alpha"], {
        cwd: tempDir,
        env: { SAFE_NPM_FIXTURES: fixture.path }
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("alpha@1.1.0 (ignored)");
      expect(result.stdout).toContain("beta@2.0.0");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });
});

function runCli(args: string[], options?: { cwd?: string; env?: Record<string, string | undefined> }) {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    cwd: options?.cwd ?? process.cwd(),
    env: { ...process.env, ...(options?.env ?? {}), FORCE_COLOR: "0" },
    encoding: "utf8"
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function createFixtureFile(packages: Record<string, RegistryPackage>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-npm-fixture-"));
  const filePath = path.join(dir, "registry.json");
  fs.writeFileSync(filePath, JSON.stringify(packages, null, 2));

  return {
    path: filePath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

function createPackage(name: string, versionDates: Record<string, string>): RegistryPackage {
  const versions: RegistryPackage["versions"] = {};
  const time: RegistryPackage["time"] = {
    created: isoDaysAgo(1000),
    modified: isoDaysAgo(1)
  };

  for (const [version, published] of Object.entries(versionDates)) {
    versions[version] = { version };
    time[version] = published;
  }

  const sortedVersions = Object.keys(versionDates).sort((a, b) => semver.rcompare(a, b));
  return {
    name,
    versions,
    time,
    "dist-tags": {
      latest: sortedVersions[0] ?? "0.0.0"
    }
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_IN_MS).toISOString();
}
