import axios from "axios";
import semver from "semver";

export interface ResolveOptions {
  name: string;
  range: string;
  registry: string;
  cutoffDate: Date;
  ignoreAge?: boolean;
}

function normalizeRegistry(registry: string): string {
  return registry.endsWith("/") ? registry.slice(0, -1) : registry;
}

function normalizeRange(range: string | undefined, distTags: Record<string, string> = {}): string {
  const trimmed = (range ?? "").trim();

  if (!trimmed || trimmed === "latest") {
    const latest = distTags.latest;
    if (latest && semver.valid(latest)) {
      return `<=${latest}`;
    }
    return "*";
  }

  if (semver.validRange(trimmed)) {
    return trimmed;
  }

  if (distTags[trimmed] && semver.valid(distTags[trimmed])) {
    return `<=${distTags[trimmed]}`;
  }

  throw new Error(`Unsupported version range: ${range}`);
}

export async function resolveSafeVersion(options: ResolveOptions): Promise<string | null> {
  const { name, range, registry, cutoffDate, ignoreAge } = options;
  const url = `${normalizeRegistry(registry)}/${encodeURIComponent(name)}`;

  const response = await axios.get(url, { timeout: 10_000 });
  const data = response.data as any;

  if (!data || typeof data !== "object") {
    throw new Error("Invalid registry response");
  }

  const times: Record<string, string> = data.time ?? {};
  const versions = Object.keys(data.versions ?? {});
  const distTags: Record<string, string> = data["dist-tags"] ?? {};

  const effectiveRange = normalizeRange(range, distTags);

  const candidates = versions
    .filter(version => semver.valid(version) && semver.satisfies(version, effectiveRange, { includePrerelease: false }))
    .filter(version => {
      if (ignoreAge) {
        return true;
      }
      const published = times[version];
      if (!published) {
        return false;
      }
      return new Date(published) <= cutoffDate;
    })
    .sort((a, b) => semver.rcompare(a, b));

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}
