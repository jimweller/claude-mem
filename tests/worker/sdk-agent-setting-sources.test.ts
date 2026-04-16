import { describe, it, expect, mock, beforeEach } from 'bun:test';

/**
 * Tests that SDKAgent passes settingSources: false to the Agent SDK query()
 * to prevent the empty --setting-sources arg bug.
 *
 * The Agent SDK defaults settingSources to [] when omitted. JS treats [] as
 * truthy, so the SDK emits ["--setting-sources", ""]. Bun's spawn() drops the
 * empty string, causing --permission-mode to be consumed as a --setting-sources
 * value (exit code 1). Passing false bypasses both the SDK's ?? [] default
 * (not nullish) and its if() guard (falsy).
 */

let capturedOptions: any = null;

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: any) => {
    capturedOptions = options;
    return (async function* () {})();
  }
}));

mock.module('../../src/utils/logger.js', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    success: () => {},
    dataOut: () => {},
    failure: () => {},
  }
}));

mock.module('../../src/shared/paths.js', () => ({
  DATA_DIR: '/tmp/test-data',
  CLAUDE_CONFIG_DIR: '/tmp/test-claude',
  MARKETPLACE_ROOT: '/tmp/test-marketplace',
  ARCHIVES_DIR: '/tmp/test-archives',
  LOGS_DIR: '/tmp/test-logs',
  TRASH_DIR: '/tmp/test-trash',
  BACKUPS_DIR: '/tmp/test-backups',
  MODES_DIR: '/tmp/test-modes',
  USER_SETTINGS_PATH: '/tmp/test-settings.json',
  DB_PATH: '/tmp/test-db',
  VECTOR_DB_DIR: '/tmp/test-vector',
  OBSERVER_SESSIONS_DIR: '/tmp/test-observer',
  CLAUDE_SETTINGS_PATH: '/tmp/test-claude-settings',
  CLAUDE_COMMANDS_DIR: '/tmp/test-commands',
  CLAUDE_MD_PATH: '/tmp/test-claude-md',
  getProjectArchiveDir: () => '/tmp/test-archive',
  getWorkerSocketPath: () => '/tmp/test-socket',
  ensureDir: () => {},
  ensureAllDataDirs: () => {},
  ensureModesDir: () => {},
}));

mock.module('../../src/shared/SettingsDefaultsManager.js', () => ({
  SettingsDefaultsManager: {
    loadFromFile: () => ({ CLAUDE_MEM_MAX_CONCURRENT_AGENTS: '10' })
  }
}));

mock.module('../../src/services/worker/ProcessRegistry.js', () => ({
  createPidCapturingSpawn: () => () => {},
  waitForSlot: async () => {},
  getProcessBySession: () => undefined,
  ensureProcessExit: async () => {},
}));

mock.module('../../src/shared/EnvManager.js', () => ({
  buildIsolatedEnv: () => ({ PATH: '/usr/bin' }),
  getAuthMethodDescription: () => 'test',
}));

mock.module('../../src/services/domain/ModeManager.js', () => ({
  ModeManager: { getInstance: () => ({ getActiveMode: () => null }) }
}));

describe('SDKAgent settingSources', () => {
  beforeEach(() => {
    capturedOptions = null;
  });

  it('passes settingSources as falsy to prevent empty --setting-sources arg', async () => {
    const { SDKAgent } = await import('../../src/services/worker/SDKAgent.js');
    const agent = new SDKAgent({
      getSessionStore: () => ({
        ensureMemorySessionIdRegistered: () => {},
        getSessionById: () => null,
      }),
    } as any, {} as any);

    const session = {
      sessionDbId: 1,
      contentSessionId: 'test-123',
      memorySessionId: null,
      lastPromptNumber: 1,
      forceInit: false,
      modelOverride: null,
      abortController: new AbortController(),
      conversationHistory: [],
      processingMessageIds: [],
      cumulativeInputTokens: 0,
      cumulativeOutputTokens: 0,
      startTime: Date.now(),
      earliestPendingTimestamp: null,
      project: 'test',
      userPrompt: 'test',
    };

    try {
      await agent.startSession(session as any);
    } catch {
      // Expected: mock generator produces no messages, session completes or errors
    }

    expect(capturedOptions).not.toBeNull();
    expect('settingSources' in capturedOptions).toBe(true);
    expect(capturedOptions.settingSources).toBe(false);
  });
});
