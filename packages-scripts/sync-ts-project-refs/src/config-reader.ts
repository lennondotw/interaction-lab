/**
 * Configuration file readers for stspr (Sync TypeScript Project References)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import yaml from 'yaml';
import { z } from 'zod';

import type { PackageConfig, RootConfig, TsconfigConfig, WorkspaceConfig } from './types.js';

// Zod schemas for configuration validation
const WorkspaceConfigSchema = z.object({
  packages: z.array(z.string()).optional().default([]),
});

const RefSchema = z.object({
  path: z.string(),
});

const ReferencesSchema = z.object({
  add: z.array(RefSchema).optional().default([]),
  skip: z.array(RefSchema).optional().default([]),
});

const RootConfigSchema = z.object({
  graph: z
    .object({
      includeIndirectDeps: z.boolean().optional().default(false),
    })
    .optional()
    .default({ includeIndirectDeps: false }),
  filters: z
    .object({
      excludePackages: z.array(z.string()).optional().default([]),
      excludeTsconfigs: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({ excludePackages: [], excludeTsconfigs: [] }),
  rootSolution: z
    .object({
      tsconfigPath: z.string().optional().default('./tsconfig.json'),
      includeSiblings: z.boolean().optional().default(true),
      references: ReferencesSchema.optional().default({ add: [], skip: [] }),
    })
    .optional()
    .default({ tsconfigPath: './tsconfig.json', includeSiblings: true, references: { add: [], skip: [] } }),
});

const PackageConfigSchema = z.object({
  exclude: z.boolean().optional().default(false),
  canonicalTsconfig: z
    .object({
      path: z.string().optional().default('./tsconfig.json'),
      includeSiblings: z.boolean().optional().default(true),
      standardReferencesCanonical: z.boolean().optional(),
      includeWorkspaceDeps: z.boolean().optional().default(true),
    })
    .optional()
    .default({
      path: './tsconfig.json',
      includeSiblings: true,
      includeWorkspaceDeps: true,
    }),
  dependencies: z
    .object({
      include: z
        .object({
          dependencies: z.boolean().optional().default(true),
          devDependencies: z.boolean().optional().default(true),
          optionalDependencies: z.boolean().optional().default(true),
        })
        .optional()
        .default({ dependencies: true, devDependencies: true, optionalDependencies: true }),
    })
    .optional()
    .default({ include: { dependencies: true, devDependencies: true, optionalDependencies: true } }),
  references: ReferencesSchema.optional().default({ add: [], skip: [] }),
});

const TsconfigConfigSchema = z.object({
  exclude: z.boolean().optional().default(false),
  includeWorkspaceDeps: z.boolean().optional(),
  references: ReferencesSchema.optional().default({ add: [], skip: [] }),
});

/**
 * Parse pnpm-workspace.yaml to get package patterns
 */
export async function parseWorkspace(monorepoRoot: string): Promise<WorkspaceConfig> {
  const workspaceFile = path.join(monorepoRoot, 'pnpm-workspace.yaml');
  const content = await fs.readFile(workspaceFile, 'utf-8');
  const rawConfig: unknown = yaml.parse(content);
  const config = WorkspaceConfigSchema.parse(rawConfig);
  const rootConfig = await readRootConfig(monorepoRoot);

  const { packages } = config;
  const includePatterns: string[] = [];
  const excludePatterns: string[] = [];

  for (const pattern of packages) {
    if (pattern.startsWith('!')) {
      excludePatterns.push(pattern.slice(1));
    } else {
      includePatterns.push(pattern);
    }
  }

  return { includePatterns, excludePatterns, rootConfig };
}

/**
 * Read package-level stspr configuration
 */
export async function readPackageConfig(packageDir: string): Promise<PackageConfig> {
  const configPath = path.join(packageDir, 'stspr.package.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawConfig: unknown = yaml.parse(content);
    const config = PackageConfigSchema.parse(rawConfig);
    const canonicalPath = config.canonicalTsconfig.path;
    const standardReferencesCanonical =
      config.canonicalTsconfig.standardReferencesCanonical ?? canonicalPath !== './tsconfig.json';

    return {
      exclude: config.exclude,
      canonicalTsconfig: {
        path: canonicalPath,
        includeSiblings: config.canonicalTsconfig.includeSiblings,
        standardReferencesCanonical,
        includeWorkspaceDeps: config.canonicalTsconfig.includeWorkspaceDeps,
      },
      dependencies: {
        include: {
          dependencies: config.dependencies.include.dependencies,
          devDependencies: config.dependencies.include.devDependencies,
          optionalDependencies: config.dependencies.include.optionalDependencies,
        },
      },
      references: {
        add: config.references.add,
        skip: config.references.skip,
      },
    };
  } catch {
    // No config file or parsing error, return defaults
    const defaultConfig = PackageConfigSchema.parse({});
    const canonicalPath = defaultConfig.canonicalTsconfig.path;
    const standardReferencesCanonical =
      defaultConfig.canonicalTsconfig.standardReferencesCanonical ?? canonicalPath !== './tsconfig.json';
    return {
      exclude: defaultConfig.exclude,
      canonicalTsconfig: {
        path: canonicalPath,
        includeSiblings: defaultConfig.canonicalTsconfig.includeSiblings,
        standardReferencesCanonical,
        includeWorkspaceDeps: defaultConfig.canonicalTsconfig.includeWorkspaceDeps,
      },
      dependencies: {
        include: {
          dependencies: defaultConfig.dependencies.include.dependencies,
          devDependencies: defaultConfig.dependencies.include.devDependencies,
          optionalDependencies: defaultConfig.dependencies.include.optionalDependencies,
        },
      },
      references: {
        add: defaultConfig.references.add,
        skip: defaultConfig.references.skip,
      },
    };
  }
}

/**
 * Read root-level stspr configuration
 */
export async function readRootConfig(monorepoRoot: string): Promise<RootConfig> {
  const configPath = path.join(monorepoRoot, 'stspr.root.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawConfig: unknown = yaml.parse(content);
    const config = RootConfigSchema.parse(rawConfig);
    return {
      graph: { includeIndirectDeps: config.graph.includeIndirectDeps },
      filters: {
        excludePackages: config.filters.excludePackages,
        excludeTsconfigs: config.filters.excludeTsconfigs,
      },
      rootSolution: {
        tsconfigPath: config.rootSolution.tsconfigPath,
        includeSiblings: config.rootSolution.includeSiblings,
        references: {
          add: config.rootSolution.references.add,
          skip: config.rootSolution.references.skip,
        },
      },
    };
  } catch {
    const defaultConfig = RootConfigSchema.parse({});
    return {
      graph: { includeIndirectDeps: defaultConfig.graph.includeIndirectDeps },
      filters: {
        excludePackages: defaultConfig.filters.excludePackages,
        excludeTsconfigs: defaultConfig.filters.excludeTsconfigs,
      },
      rootSolution: {
        tsconfigPath: defaultConfig.rootSolution.tsconfigPath,
        includeSiblings: defaultConfig.rootSolution.includeSiblings,
        references: {
          add: defaultConfig.rootSolution.references.add,
          skip: defaultConfig.rootSolution.references.skip,
        },
      },
    };
  }
}

/**
 * Read tsconfig-level stspr configuration
 */
export async function readTsconfigConfig(tsconfigPath: string): Promise<TsconfigConfig> {
  const dir = path.dirname(tsconfigPath);
  const basename = path.basename(tsconfigPath, '.json');
  const configPath = path.join(dir, `${basename}.stspr.yaml`);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawConfig: unknown = yaml.parse(content);
    const config = TsconfigConfigSchema.parse(rawConfig);

    return {
      exclude: config.exclude,
      includeWorkspaceDeps: config.includeWorkspaceDeps,
      references: {
        add: config.references.add,
        skip: config.references.skip,
      },
    };
  } catch {
    // No config file or parsing error, return defaults
    const defaultConfig = TsconfigConfigSchema.parse({});
    return {
      exclude: defaultConfig.exclude,
      includeWorkspaceDeps: defaultConfig.includeWorkspaceDeps,
      references: {
        add: defaultConfig.references.add,
        skip: defaultConfig.references.skip,
      },
    };
  }
}
