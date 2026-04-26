import { join, dirname, basename, sep } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { SettingsDefaultsManager } from './SettingsDefaultsManager.js';
import { logger } from '../utils/logger.js';

// Get __dirname that works in both ESM (hooks) and CJS (worker) contexts
function getDirname(): string {
  // CJS context - __dirname exists
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // ESM context - use import.meta.url
  return dirname(fileURLToPath(import.meta.url));
}

const _dirname = getDirname();

/**
 * Simple path configuration for claude-mem
 * Standard paths based on Claude Code conventions
 */

// Base directories
// Resolve DATA_DIR with full priority: env var > settings.json > default.
// SettingsDefaultsManager.get() handles env > default. For settings file
// support, we do a one-time synchronous read of the default settings path
// to check if the user configured a custom DATA_DIR there.
function resolveDataDir(): string {
  // 1. Environment variable (highest priority) — already handled by get()
  if (process.env.CLAUDE_MEM_DATA_DIR) {
    return process.env.CLAUDE_MEM_DATA_DIR;
  }

  // 2. Settings file at the default location
  const defaultDataDir = join(homedir(), '.claude-mem');
  const settingsPath = join(defaultDataDir, 'settings.json');
  try {
    if (existsSync(settingsPath)) {
      const { readFileSync } = require('fs');
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const settings = raw.env ?? raw; // handle legacy nested schema
      if (settings.CLAUDE_MEM_DATA_DIR) {
        return settings.CLAUDE_MEM_DATA_DIR;
      }
    }
  } catch {
    // settings file missing or corrupt — fall through to default
  }

  // 3. Hardcoded default
  return defaultDataDir;
}

export const DATA_DIR = resolveDataDir();
// Note: CLAUDE_CONFIG_DIR is a Claude Code setting, not claude-mem, so leave as env var
export const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

// Marketplace clone directory - the git checkout that powers BranchManager's
// stable/beta switching feature. NOT the plugin's runtime root; see PLUGIN_ROOT.
// Hardcoded to the upstream marketplace name; only meaningful when running on
// the upstream install. Forks that need branch-switching from their own
// marketplace must override this (out of scope for this change).
export const MARKETPLACE_ROOT = join(CLAUDE_CONFIG_DIR, 'plugins', 'marketplaces', 'thedotmack');

/**
 * Resolve the plugin's runtime root directory.
 *
 * The runtime root is the directory containing this plugin's `scripts/`,
 * `skills/`, `commands/`, `.claude-plugin/` etc. — the layout Claude Code
 * actually executes from.
 *
 * Resolution order:
 *   1. CLAUDE_PLUGIN_ROOT env var. Claude Code sets this to the cache
 *      directory (`<plugins>/cache/<owner>/<plugin>/<version>`) when invoking
 *      hooks. This is the canonical answer in hook context.
 *   2. Self-location of the bundled script. The bundled scripts ship at
 *      `<root>/scripts/<bundle>.cjs`, so the runtime root is the parent of
 *      this module's `_dirname`. Works inside worker-service.cjs,
 *      mcp-server.cjs, etc., regardless of where they were copied.
 *   3. installed_plugins.json lookup. Reads Claude Code's own record of
 *      where the plugin is installed. Used by the npx CLI which has neither
 *      the env var nor a co-located bundle.
 *   4. Legacy fallback: `<MARKETPLACE_ROOT>/plugin`. Only correct on the
 *      upstream marketplace install; preserved for backward compatibility.
 */
export function getPluginRoot(): string {
  // 1. Hook context — env var
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot && existsSync(envRoot)) {
    return envRoot;
  }

  // 2. Bundled-script self-location
  const fromBundle = join(_dirname, '..');
  if (existsSync(join(fromBundle, '.claude-plugin', 'plugin.json'))) {
    return fromBundle;
  }

  // 3. installed_plugins.json — first claude-mem entry that points at an
  //    install path that exists on disk
  try {
    const installedPath = join(CLAUDE_CONFIG_DIR, 'plugins', 'installed_plugins.json');
    if (existsSync(installedPath)) {
      const data = JSON.parse(readFileSync(installedPath, 'utf-8'));
      const plugins = data?.plugins ?? {};
      for (const key of Object.keys(plugins)) {
        if (!key.startsWith('claude-mem@')) continue;
        const entries = plugins[key];
        if (!Array.isArray(entries)) continue;
        const installPath = entries[0]?.installPath;
        if (typeof installPath === 'string' && existsSync(installPath)) {
          return installPath;
        }
      }
    }
  } catch {
    // Fall through to legacy fallback
  }

  // 4. Legacy fallback
  return join(MARKETPLACE_ROOT, 'plugin');
}

// Data subdirectories
export const ARCHIVES_DIR = join(DATA_DIR, 'archives');
export const LOGS_DIR = join(DATA_DIR, 'logs');
export const TRASH_DIR = join(DATA_DIR, 'trash');
export const BACKUPS_DIR = join(DATA_DIR, 'backups');
export const MODES_DIR = join(DATA_DIR, 'modes');
export const USER_SETTINGS_PATH = join(DATA_DIR, 'settings.json');
export const DB_PATH = join(DATA_DIR, 'claude-mem.db');
export const VECTOR_DB_DIR = join(DATA_DIR, 'vector-db');

// Observer sessions directory - used as cwd for SDK queries
// Sessions here won't appear in user's `claude --resume` for their actual projects
export const OBSERVER_SESSIONS_DIR = join(DATA_DIR, 'observer-sessions');

// Claude integration paths
export const CLAUDE_SETTINGS_PATH = join(CLAUDE_CONFIG_DIR, 'settings.json');
export const CLAUDE_COMMANDS_DIR = join(CLAUDE_CONFIG_DIR, 'commands');
export const CLAUDE_MD_PATH = join(CLAUDE_CONFIG_DIR, 'CLAUDE.md');

/**
 * Get project-specific archive directory
 */
export function getProjectArchiveDir(projectName: string): string {
  return join(ARCHIVES_DIR, projectName);
}

/**
 * Get worker socket path for a session
 */
export function getWorkerSocketPath(sessionId: number): string {
  return join(DATA_DIR, `worker-${sessionId}.sock`);
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * Ensure all data directories exist
 */
export function ensureAllDataDirs(): void {
  ensureDir(DATA_DIR);
  ensureDir(ARCHIVES_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(TRASH_DIR);
  ensureDir(BACKUPS_DIR);
  ensureDir(MODES_DIR);
}

/**
 * Ensure modes directory exists
 */
export function ensureModesDir(): void {
  ensureDir(MODES_DIR);
}

/**
 * Ensure all Claude integration directories exist
 */
export function ensureAllClaudeDirs(): void {
  ensureDir(CLAUDE_CONFIG_DIR);
  ensureDir(CLAUDE_COMMANDS_DIR);
}

/**
 * Get current project name from git root or cwd.
 * Includes parent directory to avoid collisions when repos share a folder name
 * (e.g., ~/work/monorepo → "work/monorepo" vs ~/personal/monorepo → "personal/monorepo").
 */
export function getCurrentProjectName(): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true
    }).trim();
    return basename(dirname(gitRoot)) + '/' + basename(gitRoot);
  } catch (error) {
    logger.debug('SYSTEM', 'Git root detection failed, using cwd basename', {
      cwd: process.cwd()
    }, error as Error);
    const cwd = process.cwd();
    return basename(dirname(cwd)) + '/' + basename(cwd);
  }
}

/**
 * Find package root directory
 *
 * Works because bundled hooks are in plugin/scripts/,
 * so package root is always one level up (the plugin directory)
 */
export function getPackageRoot(): string {
  return join(_dirname, '..');
}

/**
 * Find commands directory in the installed package
 */
export function getPackageCommandsDir(): string {
  const packageRoot = getPackageRoot();
  return join(packageRoot, 'commands');
}

/**
 * Create a timestamped backup filename
 */
export function createBackupFilename(originalPath: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  return `${originalPath}.backup.${timestamp}`;
}
