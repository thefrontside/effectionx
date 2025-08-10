export interface ExtensionConfig {
  name: string;
  description: string;
  effection: string[];
  registries: ('npm' | 'jsr')[];
}

export interface GlobalFlags {
  verbose?: boolean;
}

export interface AnalyzeFlags extends GlobalFlags {
  extName?: string;
}

export interface VerifyFlags extends GlobalFlags {
  extName?: string;
  deno?: boolean;
  node?: boolean;
  effection?: string;
  lint?: boolean;
}

export interface PlanFlags extends GlobalFlags {
  extName?: string;
  jsr?: boolean;
  npm?: boolean;
  effection?: string;
}

export interface PublishFlags extends GlobalFlags {
  extName?: string;
  jsr?: boolean;
  npm?: boolean;
  effection?: string;
}

export function defineConfig(config: ExtensionConfig): ExtensionConfig {
  return config;
}