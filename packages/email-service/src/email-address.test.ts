import { describe, it, expect } from 'vitest';
import { generateEmailAddress, isValidAgentEmail } from './email-address.js';

describe('generateEmailAddress', () => {
  it('creates address with default domain', () => {
    expect(generateEmailAddress('research-bot')).toBe('research-bot@agentpass.dev');
  });

  it('creates address with custom domain', () => {
    expect(generateEmailAddress('myagent', 'custom.io')).toBe('myagent@custom.io');
  });

  it('lowercases the agent name', () => {
    expect(generateEmailAddress('MyAgent')).toBe('myagent@agentpass.dev');
  });

  it('replaces invalid characters with hyphens', () => {
    expect(generateEmailAddress('my agent!')).toBe('my-agent@agentpass.dev');
  });

  it('collapses consecutive hyphens', () => {
    expect(generateEmailAddress('my--agent')).toBe('my-agent@agentpass.dev');
  });

  it('trims leading and trailing hyphens', () => {
    expect(generateEmailAddress('-agent-')).toBe('agent@agentpass.dev');
  });

  it('throws on empty/invalid name', () => {
    expect(() => generateEmailAddress('!!!')).toThrow(
      'Agent name must contain at least one alphanumeric character',
    );
  });
});

describe('isValidAgentEmail', () => {
  it('accepts valid agent email', () => {
    expect(isValidAgentEmail('research-bot@agentpass.dev')).toBe(true);
  });

  it('accepts single-char local part', () => {
    expect(isValidAgentEmail('a@agentpass.dev')).toBe(true);
  });

  it('rejects uppercase', () => {
    expect(isValidAgentEmail('Agent@agentpass.dev')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidAgentEmail('agent@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(isValidAgentEmail('@agentpass.dev')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidAgentEmail('my agent@agentpass.dev')).toBe(false);
  });

  it('rejects local part starting with hyphen', () => {
    expect(isValidAgentEmail('-agent@agentpass.dev')).toBe(false);
  });

  it('rejects local part ending with hyphen', () => {
    expect(isValidAgentEmail('agent-@agentpass.dev')).toBe(false);
  });
});
