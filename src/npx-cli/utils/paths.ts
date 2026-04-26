/**
 * Shared path utilities for the NPX CLI.
 *
 * All platform-specific path logic is centralized here so that every command
 * resolves directories in exactly the same way, regardless of OS.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Core paths
// ---------------------------------------------------------------------------

/** Root of the Claude Code config directory. */
export function claudeConfigDirectory(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/**
 * Marketplace install directory for the upstream thedotmack distribution.
 *
 * This is the directory that `npx claude-mem install` writes into, and that
 * the upstream marketplace clones into. It is not the same as the running
 * plugin's install path, which is owned by Claude Code's plugin system.
 * For runtime operations (start/stop/restart/status), prefer
 * installedPluginDirectory() — it consults Claude Code's own registry.
 */
export function marketplaceDirectory(): string {
  return join(claudeConfigDirectory(), 'plugins', 'marketplaces', 'thedotmack');
}

/**
 * Resolve the runtime install directory for claude-mem, regardless of which
 * marketplace it was installed from.
 *
 * Resolution order:
 *   1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code in hook contexts)
 *   2. First `claude-mem@*` entry in installed_plugins.json whose
 *      installPath exists on disk
 *   3. Fallback to marketplaceDirectory() + 'plugin' (legacy thedotmack
 *      layout) — only correct for upstream npx-installed setups
 */
export function installedPluginDirectory(): string {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot && existsSync(envRoot)) {
    return envRoot;
  }

  try {
    const installedPath = installedPluginsPath();
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

  return join(marketplaceDirectory(), 'plugin');
}

/** Top-level plugins directory. */
export function pluginsDirectory(): string {
  return join(claudeConfigDirectory(), 'plugins');
}

/** Path to `known_marketplaces.json`. */
export function knownMarketplacesPath(): string {
  return join(pluginsDirectory(), 'known_marketplaces.json');
}

/** Path to `installed_plugins.json`. */
export function installedPluginsPath(): string {
  return join(pluginsDirectory(), 'installed_plugins.json');
}

/** Path to `~/.claude/settings.json`. */
export function claudeSettingsPath(): string {
  return join(claudeConfigDirectory(), 'settings.json');
}

/** Plugin cache directory for a specific version. */
export function pluginCacheDirectory(version: string): string {
  return join(pluginsDirectory(), 'cache', 'thedotmack', 'claude-mem', version);
}

/** claude-mem data directory (default `~/.claude-mem`). */
export function claudeMemDataDirectory(): string {
  return join(homedir(), '.claude-mem');
}

// ---------------------------------------------------------------------------
// NPM package root (where the NPX package lives on disk)
// ---------------------------------------------------------------------------

/**
 * Resolve the root of the installed npm package.
 *
 * After bundling, the CLI entry point lives at `<pkg>/dist/npx-cli/index.js`.
 * Walking up 2 levels from `import.meta.url` reaches the package root
 * where `plugin/` and `package.json` can be found.
 */
export function npmPackageRootDirectory(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  // <pkg>/dist/npx-cli/index.js  ->  up 2 levels  ->  <pkg>
  const root = join(dirname(currentFilePath), '..', '..');
  if (!existsSync(join(root, 'package.json'))) {
    throw new Error(
      `npmPackageRootDirectory: expected package.json at ${root}. ` +
      `Bundle structure may have changed — update the path walk.`,
    );
  }
  return root;
}

/**
 * Path to the `plugin/` directory bundled inside the npm package.
 */
export function npmPackagePluginDirectory(): string {
  return join(npmPackageRootDirectory(), 'plugin');
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

/**
 * Read the current plugin version from the npm package's
 * `plugin/.claude-plugin/plugin.json` (preferred) or from `package.json`.
 */
export function readPluginVersion(): string {
  // Try plugin.json first (authoritative for plugin version)
  const pluginJsonPath = join(npmPackagePluginDirectory(), '.claude-plugin', 'plugin.json');
  if (existsSync(pluginJsonPath)) {
    try {
      const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
      if (pluginJson.version) return pluginJson.version;
    } catch {
      // Fall through to package.json
    }
  }

  // Fall back to package.json at package root
  const packageJsonPath = join(npmPackageRootDirectory(), 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.version) return packageJson.version;
    } catch {
      // Unable to read
    }
  }

  return '0.0.0';
}

// ---------------------------------------------------------------------------
// Installation detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the plugin appears to be installed.
 *
 * Checks the runtime install (cache or non-thedotmack marketplace) first,
 * then falls back to the upstream thedotmack marketplace layout.
 */
export function isPluginInstalled(): boolean {
  const runtimeRoot = installedPluginDirectory();
  // Cache layout: <root>/.claude-plugin/plugin.json
  if (existsSync(join(runtimeRoot, '.claude-plugin', 'plugin.json'))) return true;
  // Marketplace layout: <root>/plugin/.claude-plugin/plugin.json
  if (existsSync(join(runtimeRoot, 'plugin', '.claude-plugin', 'plugin.json'))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// JSON file helpers
// ---------------------------------------------------------------------------

export function ensureDirectoryExists(directoryPath: string): void {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
}

/**
 * @deprecated Use `readJsonSafe` from `../../utils/json-utils.js` instead.
 * Kept as re-export for backward compatibility.
 */
export { readJsonSafe } from '../../utils/json-utils.js';

export function writeJsonFileAtomic(filepath: string, data: any): void {
  ensureDirectoryExists(dirname(filepath));
  writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
