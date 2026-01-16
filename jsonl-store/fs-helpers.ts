import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Check if a file or directory exists
 */
export async function exists(pathOrUrl: string | URL): Promise<boolean> {
  try {
    const filePath = pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : pathOrUrl;
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Empty a directory by removing all its contents
 */
export async function emptyDir(pathOrUrl: string | URL): Promise<void> {
  const dirPath = pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : pathOrUrl;
  
  try {
    const entries = await fsp.readdir(dirPath);
    await Promise.all(
      entries.map(entry => 
        fsp.rm(path.join(dirPath, entry), { recursive: true, force: true })
      )
    );
  } catch (error) {
    // If directory doesn't exist, create it
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fsp.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

export interface WalkEntry {
  path: string;
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface WalkOptions {
  includeDirs?: boolean;
  includeFiles?: boolean;
  match?: RegExp[];
}

/**
 * Walk a directory tree and yield entries
 */
export async function* walk(
  root: string,
  options: WalkOptions = {}
): AsyncGenerator<WalkEntry> {
  const { includeDirs = true, includeFiles = true, match } = options;
  
  async function* walkDir(dir: string): AsyncGenerator<WalkEntry> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      const walkEntry: WalkEntry = {
        path: fullPath,
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
      };
      
      if (entry.isDirectory()) {
        if (includeDirs) {
          if (!match || match.some(re => re.test(fullPath))) {
            yield walkEntry;
          }
        }
        yield* walkDir(fullPath);
      } else if (entry.isFile()) {
        if (includeFiles) {
          if (!match || match.some(re => re.test(fullPath))) {
            yield walkEntry;
          }
        }
      }
    }
  }
  
  yield* walkDir(root);
}

/**
 * Convert a file URL to a path
 */
export { fileURLToPath as fromFileUrl };

/**
 * Convert a path to a file URL
 */
export { pathToFileURL as toFileUrl };

/**
 * Convert a glob pattern to a RegExp
 * Simplified implementation that handles common patterns
 */
export function globToRegExp(glob: string, options?: { globstar?: boolean }): RegExp {
  let pattern = glob
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle **
    .replace(/\*\*/g, options?.globstar ? '.*' : '[^/]*')
    // Handle single *
    .replace(/(?<!\*)\*(?!\*)/g, '[^/]*')
    // Handle ?
    .replace(/\?/g, '.');
  
  return new RegExp(`^${pattern}$`);
}
