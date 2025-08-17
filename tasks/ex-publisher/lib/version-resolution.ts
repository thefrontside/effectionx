import { type Operation, until } from "npm:effection@3.6.0";
import { fetch } from "./fetch.ts";

export interface EffectionVersionResolution {
  extensionName: string;
  requestedVersions: string[];
  resolvedVersions: Record<string, string>;
  errors?: string[];
}

export interface ExtensionInput {
  name: string;
  config: {
    effection: string[];
  };
}

// Cache for NPM registry responses to avoid repeated requests
let versionCache: string[] | null = null;

export function parseVersionConstraint(constraint: string): string {
  if (constraint.includes("-")) {
    const [major, modifier] = constraint.split("-");
    
    switch (modifier) {
      case "alpha":
        return `>=${major}.0.0-alpha <${major}.0.0`;
      case "beta":
        return `>=${major}.0.0-beta <${major}.0.0`;
      case "rc":
        return `>=${major}.0.0-rc <${major}.0.0`;
      case "prerelease":
        return `>=${major}.0.0-0 <${major}.0.0`;
      case "any":
        return `>=${major}.0.0-0 <${parseInt(major) + 1}.0.0`;
      default:
        throw new Error(`Unknown version modifier: ${modifier}`);
    }
  }
  
  // Simple major version constraint
  const major = parseInt(constraint);
  return `>=${major}.0.0 <${major + 1}.0.0`;
}

export function findHighestVersionInRange(versions: string[], range: string): string | undefined {
  // Parse the range - expect format like ">=3.0.0 <4.0.0" or ">=4.0.0-beta <4.0.0"
  const rangeMatch = range.match(/>=([^\s]+)\s+<([^\s]+)/);
  if (!rangeMatch) {
    throw new Error(`Invalid range format: ${range}`);
  }
  
  const [, minVersion, maxVersion] = rangeMatch;
  
  // Check if we're looking for a specific prerelease type
  const specificPrereleaseType = minVersion.includes("-") ? minVersion.split("-")[1] : null;
  
  // Filter versions that match the range
  let matchingVersions = versions.filter(version => {
    return satisfiesRange(version, minVersion, maxVersion);
  });
  
  // If looking for a specific prerelease type, filter further
  if (specificPrereleaseType && specificPrereleaseType !== "0") {
    matchingVersions = matchingVersions.filter(version => {
      return version.includes(`-${specificPrereleaseType}`);
    });
  }
  
  if (matchingVersions.length === 0) {
    return undefined;
  }
  
  // Sort versions and return the highest
  // Prefer stable versions over prereleases when both exist (for "-any" ranges)
  const stableVersions = matchingVersions.filter(v => !v.includes("-"));
  const prereleaseVersions = matchingVersions.filter(v => v.includes("-"));
  
  if (stableVersions.length > 0) {
    return sortVersions(stableVersions)[stableVersions.length - 1];
  } else {
    return sortVersions(prereleaseVersions)[prereleaseVersions.length - 1];
  }
}

function satisfiesRange(version: string, minVersion: string, maxVersion: string): boolean {
  return compareVersions(version, minVersion) >= 0 && compareVersions(version, maxVersion) < 0;
}

function sortVersions(versions: string[]): string[] {
  return versions.sort(compareVersions);
}

function compareVersions(a: string, b: string): number {
  // Simple semantic version comparison
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  
  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    if (aParts.numbers[i] !== bParts.numbers[i]) {
      return aParts.numbers[i] - bParts.numbers[i];
    }
  }
  
  // Handle prerelease comparison
  if (aParts.prerelease && bParts.prerelease) {
    return aParts.prerelease.localeCompare(bParts.prerelease);
  } else if (aParts.prerelease && !bParts.prerelease) {
    return -1; // prerelease comes before stable
  } else if (!aParts.prerelease && bParts.prerelease) {
    return 1; // stable comes after prerelease
  }
  
  return 0;
}

function parseVersion(version: string): { numbers: number[]; prerelease?: string } {
  const [versionPart, prerelease] = version.split("-");
  const numbers = versionPart.split(".").map(Number);
  
  return {
    numbers,
    prerelease
  };
}

export function* fetchEffectionVersions(): Operation<string[]> {
  // Return cached versions if available
  if (versionCache !== null) {
    return versionCache;
  }
  
  try {
    const response = yield* fetch("https://registry.npmjs.org/effection");
    
    if (!response.ok) {
      throw new Error(`NPM registry request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = yield* until(response.json());
    const versions = Object.keys(data.versions || {});
    
    // Cache the results
    versionCache = versions;
    
    return versions;
  } catch (error) {
    console.warn("Failed to fetch Effection versions:", error);
    return [];
  }
}

export function* resolveEffectionVersions(
  extensions: ExtensionInput[]
): Operation<EffectionVersionResolution[]> {
  // Fetch all available Effection versions once
  const availableVersions = yield* fetchEffectionVersions();
  
  const results: EffectionVersionResolution[] = [];
  
  for (const extension of extensions) {
    const resolution: EffectionVersionResolution = {
      extensionName: extension.name,
      requestedVersions: extension.config.effection,
      resolvedVersions: {},
      errors: []
    };
    
    for (const constraint of extension.config.effection) {
      try {
        const range = parseVersionConstraint(constraint);
        const resolvedVersion = findHighestVersionInRange(availableVersions, range);
        
        if (resolvedVersion) {
          resolution.resolvedVersions[constraint] = resolvedVersion;
        } else {
          resolution.errors?.push(`No versions found for constraint: ${constraint}`);
        }
      } catch (error) {
        resolution.errors?.push(`Failed to resolve ${constraint}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    results.push(resolution);
  }
  
  return results;
}