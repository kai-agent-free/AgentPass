/**
 * PayLock Integration E2E Test
 * 
 * Tests the AgentPass SDK against the live production API
 * to demonstrate the verify → pass/fail flow for PayLock escrow.
 */
import { describe, it, expect } from 'vitest';
import { AgentPassClient, createVerificationMiddleware, generateWellKnownConfig } from './index.js';

const API_URL = 'https://api.agentpass.space';
const KNOWN_PASSPORT_ID = 'ap_a622a643aa71'; // Kai's passport

describe('PayLock × AgentPass E2E', () => {
  const client = new AgentPassClient({ apiUrl: API_URL });

  it('should retrieve passport info for a known agent', async () => {
    // Use public endpoint — no auth required
    const res = await fetch(`${API_URL}/passports/${KNOWN_PASSPORT_ID}/public`);
    const passport = await res.json();
    
    expect(passport).toBeDefined();
    expect(passport.id).toBe(KNOWN_PASSPORT_ID);
    expect(passport.public_key).toBeTruthy();
    expect(passport.status).toBe('active');
    expect(typeof passport.trust_score).toBe('number');
  });

  it('should fail verification with invalid signature (fail case)', async () => {
    const result = await client.verifyPassport(
      KNOWN_PASSPORT_ID,
      'test-challenge-123',
      'invalid-signature-abc'
    );
    expect(result.valid).toBe(false);
    expect(result.passport_id).toBe(KNOWN_PASSPORT_ID);
    expect(result.status).toBe('active');
  });

  it('should return null from middleware when headers are missing', async () => {
    const verify = createVerificationMiddleware({ apiUrl: API_URL });
    
    const mockHeaders = {
      get: (_name: string) => null
    };
    
    const result = await verify(mockHeaders);
    expect(result).toBeNull();
  });

  it('should return null from middleware with invalid credentials', async () => {
    const verify = createVerificationMiddleware({ apiUrl: API_URL });
    
    const mockHeaders = {
      get: (name: string) => {
        if (name === 'X-AgentPass-ID') return KNOWN_PASSPORT_ID;
        if (name === 'X-AgentPass-Signature') return 'bad-signature';
        return null;
      }
    };
    
    const result = await verify(mockHeaders);
    expect(result).toBeNull();
  });

  it('should fail for non-existent passport', async () => {
    const res = await fetch(`${API_URL}/passports/ap_nonexistent_000/public`);
    expect(res.ok).toBe(false);
  });

  it('should generate well-known config for PayLock', () => {
    const config = generateWellKnownConfig({
      authEndpoint: 'https://paylock.xyz/auth/agentpass',
      capabilities: ['ed25519-verification', 'escrow-release']
    });
    
    expect(config.agentpass).toBe(true);
    expect(config.auth_endpoint).toBe('https://paylock.xyz/auth/agentpass');
    expect(config.capabilities).toContain('ed25519-verification');
    expect(config.capabilities).toContain('escrow-release');
  });
});
