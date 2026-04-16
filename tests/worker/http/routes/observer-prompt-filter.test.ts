import { describe, it, expect } from 'bun:test';

/**
 * Tests that observer-sessions prompts are not stored in user_prompts.
 * The SDK agent runs under project "observer-sessions" and its init/continuation
 * prompts should not pollute the user's searchable prompt history.
 */
describe('Observer prompt filtering', () => {
  it('SessionRoutes skips saveUserPrompt for observer-sessions project', async () => {
    // Read the actual source to verify the filter exists
    const fs = await import('fs');
    const source = fs.readFileSync('src/services/worker/http/routes/SessionRoutes.ts', 'utf-8');

    // The code must skip saving prompts when project is 'observer-sessions'
    const hasObserverFilter = source.includes("observer-sessions") &&
      source.includes("saveUserPrompt");

    // The filter must appear BEFORE the saveUserPrompt call
    const filterIndex = source.indexOf('observer-sessions');
    const saveIndex = source.indexOf('saveUserPrompt');

    expect(hasObserverFilter).toBe(true);
    expect(filterIndex).toBeLessThan(saveIndex);
  });
});
