import { describe, it, expect } from 'bun:test';

/**
 * Tests that observer-sessions are blocked before any DB or SDK work.
 * The SDK agent runs under project "observer-sessions" and must be rejected
 * before session creation to prevent recursive agent spawning and pool exhaustion.
 */
describe('Observer prompt filtering', () => {
  it('SessionRoutes blocks observer-sessions before createSDKSession in handleSessionInitByClaudeId', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/services/worker/http/routes/SessionRoutes.ts', 'utf-8');

    // Extract the handleSessionInitByClaudeId method body (assignment, not declaration)
    const methodStart = source.indexOf('handleSessionInitByClaudeId = this.wrapHandler');
    const methodBody = source.slice(methodStart);

    // Within that method, observer-sessions must appear before createSDKSession
    const filterIndex = methodBody.indexOf("observer-sessions");
    const createSessionIndex = methodBody.indexOf('createSDKSession');

    expect(filterIndex).toBeGreaterThan(-1);
    expect(createSessionIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeLessThan(createSessionIndex);
  });

  it('SessionRoutes blocks observer-sessions before saveUserPrompt', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/services/worker/http/routes/SessionRoutes.ts', 'utf-8');

    const filterIndex = source.indexOf("observer-sessions");
    const saveIndex = source.indexOf('saveUserPrompt');

    expect(filterIndex).toBeGreaterThan(-1);
    expect(saveIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeLessThan(saveIndex);
  });
});
