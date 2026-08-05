#!/usr/bin/env npx tsx
/**
 * Prepack script for @monorepo/sync-ts-project-refs
 *
 * This script:
 * 1. Cleans the dist folder
 * 2. Cleans and creates dist-npm folder
 * 3. Copies selected fields from package.json to dist-npm/package.json
 * 4. Runs sort-package-json
 * 5. Runs pnpm build
 * 6. Copies dist to dist-npm (excluding source maps)
 * 7. Copies additional assets (README, example-configs, schemas)
 */

import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import sortPackageJson from 'sort-package-json';
import { $ } from 'zx';

// Disable verbose output (errors will still be thrown)
$.verbose = false;

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_NPM_DIR = path.join(ROOT_DIR, 'dist-npm');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

/** Fields to copy from source package.json to dist-npm/package.json (supports dot notation like a.b.c) */
const PACKAGE_FIELDS_TO_COPY = [
  'name',
  'version',
  'description',
  'type',
  'files',
  'imports',
  'exports',
  'bin',
  'keywords',
  'author',
  'license',
  'repository',
  'homepage',
  'bugs',
  'engines',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'publishConfig.access',
] as const;

/** Patterns to ignore when copying dist folder */
const DIST_IGNORE_PATTERNS = ['**/*.js.map', '**/*.d.ts.map', '**/*.tsbuildinfo'];

/** Override specific fields in the output package.json */
const PACKAGE_FIELD_OVERRIDES: Record<string, unknown> = {
  name: '@monorepo-tooling/sync-ts-project-refs',
};

// ─────────────────────────────────────────────────────────────────────────────
// FS Utilities (native replacements for fs-extra)
// ─────────────────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function readJson<T = unknown>(p: string): Promise<T> {
  const content = await fs.readFile(p, 'utf-8');
  return JSON.parse(content) as T;
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n');
}

async function copy(src: string, dest: string): Promise<void> {
  await fs.cp(src, dest, { recursive: true });
}

async function emptyDir(dir: string): Promise<number> {
  if (!(await exists(dir))) return 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(entries.map((entry) => fs.rm(path.join(dir, entry.name), { recursive: true, force: true })));
  return entries.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Object Path Utilities
// ─────────────────────────────────────────────────────────────────────────────

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] == null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys.at(-1);
  if (lastKey) {
    current[lastKey] = value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging Utilities
// ─────────────────────────────────────────────────────────────────────────────

function logStep(step: number, total: number, message: string): void {
  const stepStr = chalk.dim(`[${step}/${total}]`);
  console.log(`\n${stepStr} ${chalk.cyan('▸')} ${chalk.bold(message)}`);
}

function logSuccess(message: string): void {
  console.log(`   ${chalk.green('✓')} ${chalk.dim(message)}`);
}

function logDetail(message: string): void {
  console.log(`   ${chalk.dim('·')} ${chalk.dim(message)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

async function cleanDist(): Promise<void> {
  const count = await emptyDir(DIST_DIR);
  if (count > 0) {
    logSuccess(`Cleaned ${chalk.yellow('dist/')} (${count} entries)`);
  } else {
    logDetail(`${chalk.yellow('dist/')} is empty, skipping`);
  }
}

async function cleanAndCreateDistNpm(): Promise<void> {
  const count = await emptyDir(DIST_NPM_DIR);
  if (count > 0) {
    logSuccess(`Cleaned ${chalk.yellow('dist-npm/')} (${count} entries)`);
  }
  await ensureDir(DIST_NPM_DIR);
  logSuccess(`Ensured ${chalk.yellow('dist-npm/')} exists`);
}

async function createPackageJson(): Promise<void> {
  const sourcePackage = await readJson<Record<string, unknown>>(PACKAGE_JSON_PATH);
  const targetPackage: Record<string, unknown> = {};

  // Copy only the fields we want (supports dot notation like a.b.c)
  const copiedFields: string[] = [];
  for (const field of PACKAGE_FIELDS_TO_COPY) {
    const value = getByPath(sourcePackage, field);
    if (value !== undefined) {
      setByPath(targetPackage, field, value);
      copiedFields.push(field);
    }
  }

  // Apply overrides
  Object.assign(targetPackage, PACKAGE_FIELD_OVERRIDES);

  const targetPath = path.join(DIST_NPM_DIR, 'package.json');
  await writeJson(targetPath, targetPackage);

  const overriddenFields = Object.keys(PACKAGE_FIELD_OVERRIDES);
  logSuccess(`Created ${chalk.yellow('dist-npm/package.json')}`);
  logDetail(`Copied fields: ${copiedFields.join(', ')}`);
  if (overriddenFields.length > 0) {
    logDetail(`Overridden: ${overriddenFields.join(', ')}`);
  }
}

async function sortAndFormatPackageJson(): Promise<void> {
  const targetPath = path.join(DIST_NPM_DIR, 'package.json');

  // Read and sort
  const content = await fs.readFile(targetPath, 'utf-8');
  const sorted = sortPackageJson(content);

  // Format with prettier
  const formatted = await prettier.format(sorted, { parser: 'json' });

  await fs.writeFile(targetPath, formatted);
  logSuccess(`Sorted and formatted ${chalk.yellow('dist-npm/package.json')}`);
}

async function runBuild(): Promise<void> {
  $.cwd = ROOT_DIR;
  await $`pnpm run build`;
  logSuccess('Build completed');
}

async function copyDistToDistNpm(): Promise<void> {
  const targetDistDir = path.join(DIST_NPM_DIR, 'dist');
  await ensureDir(targetDistDir);

  // Get all files from dist, excluding source maps
  const { globby } = await import('globby');
  const files = await globby('**/*', {
    cwd: DIST_DIR,
    ignore: DIST_IGNORE_PATTERNS,
    dot: true,
  });

  let copiedCount = 0;

  for (const file of files) {
    const src = path.join(DIST_DIR, file);
    const dest = path.join(targetDistDir, file);

    // Skip if it's a directory entry (globby might include them)
    const stat = await fs.stat(src);
    if (stat.isDirectory()) continue;

    await ensureDir(path.dirname(dest));
    await copy(src, dest);
    copiedCount++;
  }

  // Count what was skipped
  const allFiles = await globby('**/*', { cwd: DIST_DIR, dot: true });
  const skippedCount = allFiles.filter((f) =>
    DIST_IGNORE_PATTERNS.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(f);
    })
  ).length;

  logSuccess(`Copied ${chalk.cyan(copiedCount)} files to ${chalk.yellow('dist-npm/dist/')}`);
  if (skippedCount > 0) {
    logDetail(`Skipped ${skippedCount} source map files`);
  }
}

async function copyAssets(): Promise<void> {
  // Read files field from package.json, excluding "dist" (handled separately)
  const pkg = await readJson<{ files?: string[] }>(PACKAGE_JSON_PATH);
  const assets = (pkg.files ?? []).filter((f) => f !== 'dist');

  for (const asset of assets) {
    const src = path.join(ROOT_DIR, asset);
    const dest = path.join(DIST_NPM_DIR, asset);

    if (await exists(src)) {
      await copy(src, dest);
      const stat = await fs.stat(src);
      const type = stat.isDirectory() ? 'folder' : 'file';
      logSuccess(`Copied ${type} ${chalk.yellow(asset)}`);
    } else {
      logDetail(`${chalk.yellow(asset)} not found, skipping`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.bold.magenta('\n📦 sync-ts-project-refs prepack\n'));

  const totalSteps = 6;

  logStep(1, totalSteps, 'Cleaning dist folder');
  await cleanDist();

  logStep(2, totalSteps, 'Cleaning and creating dist-npm folder');
  await cleanAndCreateDistNpm();

  logStep(3, totalSteps, 'Creating package.json for npm');
  await createPackageJson();

  logStep(4, totalSteps, 'Sorting and formatting package.json');
  await sortAndFormatPackageJson();

  logStep(5, totalSteps, 'Running build');
  await runBuild();

  logStep(6, totalSteps, 'Copying dist and assets to dist-npm');
  await copyDistToDistNpm();
  await copyAssets();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(chalk.bold.green(`\n✨ Done in ${duration}s\n`));
}

main().catch((error: unknown) => {
  console.error(chalk.red('\n❌ Prepack failed:\n'));
  console.error(error);
  process.exit(1);
});
