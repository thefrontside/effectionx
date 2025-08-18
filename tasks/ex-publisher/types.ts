import { z } from "npm:zod@^3.20.2";
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

// Individual version resolution result for UI display
export interface VersionResolutionResult {
  constraint: string;
  resolvedVersion: string | null;
  error: string | null;
}

export const ExtensionConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  effection: z.array(z.string()),
  registries: z.array(z.enum(["npm", "jsr"])),
});

export const GlobalFlagsSchema = z.object({
  verbose: z.boolean().optional(),
});

export const AnalyzeFlagsSchema = GlobalFlagsSchema.extend({
  extName: z.string().optional(),
  workspaceRoot: z.string().optional(),
});

export const VerifyFlagsSchema = GlobalFlagsSchema.extend({
  extName: z.string().optional(),
  deno: z.boolean().optional(),
  node: z.boolean().optional(),
  effection: z.string().optional(),
  lint: z.boolean().optional(),
});

export const PlanFlagsSchema = GlobalFlagsSchema.extend({
  extName: z.string().optional(),
  jsr: z.boolean().optional(),
  npm: z.boolean().optional(),
  effection: z.string().optional(),
});

export const PublishFlagsSchema = GlobalFlagsSchema.extend({
  extName: z.string().optional(),
  jsr: z.boolean().optional(),
  npm: z.boolean().optional(),
  effection: z.string().optional(),
});

export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;
export type GlobalFlags = z.infer<typeof GlobalFlagsSchema>;
export type AnalyzeFlags = z.infer<typeof AnalyzeFlagsSchema>;
export type VerifyFlags = z.infer<typeof VerifyFlagsSchema>;
export type PlanFlags = z.infer<typeof PlanFlagsSchema>;
export type PublishFlags = z.infer<typeof PublishFlagsSchema>;

// Command argument types with required workspaceRoot
export type AnalyzeCommandArgs = Omit<AnalyzeFlags, "workspaceRoot"> & {
  workspaceRoot: string;
};

// Extension analysis result with resolved versions
export interface ExtensionAnalysis {
  name: string;
  path: string;
  config: ExtensionConfig;
  version: string;
  resolvedVersions: VersionResolutionResult[];
}

export function defineConfig(config: ExtensionConfig): ExtensionConfig {
  return ExtensionConfigSchema.parse(config);
}

export type Commands = {
  command: "analyze";
  options: AnalyzeFlags;
} | {
  command: "verify";
  options: VerifyFlags;
} | {
  command: "plan";
  options: PlanFlags;
} | {
  command: "publish";
  options: PublishFlags;
};
