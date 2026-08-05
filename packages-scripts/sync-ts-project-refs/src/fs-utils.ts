/**
 * File system utilities for TypeScript configuration management
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { globby } from 'globby';
import * as jsonc from 'jsonc-parser';

import type { TsConfig, WorkspaceConfig } from './types.js';

/**
 * Find all package.json files in the workspace
 */
export async function findAllPackageJsons(
  monorepoRoot: string,
  { includePatterns, excludePatterns }: Pick<WorkspaceConfig, 'includePatterns' | 'excludePatterns'>
): Promise<string[]> {
  const patterns = includePatterns.map((p) => path.join(p, 'package.json'));

  const files = await globby(patterns, {
    cwd: monorepoRoot,
    absolute: true,
    gitignore: true,
    ignore: excludePatterns.map((p) => path.join(p, '**')),
  });

  return files;
}

/**
 * Read and parse tsconfig.json (with comment support using jsonc-parser)
 */
export async function readTsConfig(tsconfigPath: string): Promise<TsConfig> {
  const content = await fs.readFile(tsconfigPath, 'utf-8');
  return jsonc.parse(content) as TsConfig;
}

/**
 * Write tsconfig.json with proper formatting using jsonc-parser
 * Returns true if the file was actually changed
 */
export async function writeTsConfig(
  tsconfigPath: string,
  config: TsConfig,
  isSolutionStyle = false,
  simulate = false
): Promise<boolean> {
  try {
    // Read existing content to preserve comments and formatting. Scoped to the
    // try: the catch path builds a file from scratch and never reads it.
    const existingContent = await fs.readFile(tsconfigPath, 'utf-8');

    // Parse existing config to check what needs to be updated
    const existingConfig = jsonc.parse(existingContent) as TsConfig;

    // Collect all edits needed (including deletions)
    const edits: jsonc.Edit[] = [];
    const keys = new Set<string>([...Object.keys(existingConfig), ...Object.keys(config)]);

    // Update each top-level property individually to preserve comments
    for (const key of keys) {
      const value = (config as Record<string, unknown>)[key];
      const existingValue = (existingConfig as Record<string, unknown>)[key];
      const valueExistsInConfig = Object.prototype.hasOwnProperty.call(config, key);

      // Only update if the value is different (including deletion)
      const serializedNew = valueExistsInConfig ? JSON.stringify(value) : undefined;
      const serializedOld = JSON.stringify(existingValue);
      if (serializedNew !== serializedOld) {
        const propertyEdits = jsonc.modify(existingContent, [key], valueExistsInConfig ? value : undefined, {
          formattingOptions: {
            tabSize: 2,
            insertSpaces: true,
            eol: '\n',
          },
        });
        edits.push(...propertyEdits);
      }
    }

    // If no edits needed, return false
    if (edits.length === 0) {
      return false;
    }

    // Apply edits to get new content
    let newContent = jsonc.applyEdits(existingContent, edits);

    // Format with prettier
    newContent = await formatWithPrettier(newContent, tsconfigPath);

    // Check if content actually changed after formatting
    const formattedExisting = await formatWithPrettier(existingContent, tsconfigPath);
    if (formattedExisting === newContent) {
      return false;
    }

    if (simulate) {
      return true;
    }

    // Write the new content
    await fs.writeFile(tsconfigPath, newContent, 'utf-8');
    return true;
  } catch {
    // File doesn't exist, create new content
    let newContent = '';

    // Add comment for solution-style tsconfig
    if (isSolutionStyle) {
      newContent += '// Solution-style tsconfig for TypeScript project references\n';
      newContent += '// This file orchestrates all workspace packages\n';
    }

    newContent += `${JSON.stringify(config, null, 2)}\n`;

    // Format with prettier
    const formattedContent = await formatWithPrettier(newContent, tsconfigPath);
    if (simulate) {
      return true;
    }
    await fs.writeFile(tsconfigPath, formattedContent, 'utf-8');
    return true;
  }
}

/**
 * Format content with prettier
 * Returns the formatted content
 */
async function formatWithPrettier(content: string, filePath: string): Promise<string> {
  try {
    const prettier = await import('prettier');
    const options = await prettier.resolveConfig(filePath);
    return await prettier.format(content, {
      ...options,
      filepath: filePath,
    });
  } catch {
    // If prettier fails, return original content
    return content;
  }
}

/**
 * Calculate relative path from one tsconfig to another
 */
export function calculateRelativePath(fromTsconfig: string, toTsconfig: string): string {
  const fromDir = path.dirname(fromTsconfig);
  let relativePath = path.relative(fromDir, toTsconfig);

  // Ensure forward slashes for cross-platform compatibility
  relativePath = relativePath.replace(/\\/g, '/');

  // Ensure path starts with ./ or ../
  if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}

/**
 * Find all tsconfig.*.json files in the same directory
 * @param tsconfigPath - The tsconfig file to find siblings for
 * @param excludeFiles - Additional files to exclude (besides the main file itself)
 */
export async function findSiblingTsconfigs(tsconfigPath: string, excludeFiles: string[] = []): Promise<string[]> {
  const dir = path.dirname(tsconfigPath);
  const basename = path.basename(tsconfigPath);
  const excludeSet = new Set([basename, ...excludeFiles]);

  try {
    const files = await fs.readdir(dir);
    const siblingTsconfigs = files
      .filter(
        (f) => f.startsWith('tsconfig.') && f.endsWith('.json') && !excludeSet.has(f) // Exclude the main file and any additional excludes
      )
      .map((f) => `./${f}`); // Use relative path from the tsconfig directory

    return siblingTsconfigs.sort();
  } catch {
    return [];
  }
}
