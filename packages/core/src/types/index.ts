// Shared TypeScript types for AgentPass

export interface AgentPassport {
  passport_id: string;
  version: string;
  identity: PassportIdentity;
  owner: PassportOwner;
  capabilities: PassportCapabilities;
  trust: TrustInfo;
  credentials_vault: VaultInfo;
  permissions: Permissions;
  audit: AuditInfo;
}

export interface PassportIdentity {
  name: string;
  description: string;
  public_key: string;
  created_at: string;
}

export interface PassportOwner {
  id: string;
  email: string;
  verified: boolean;
}

export interface PassportCapabilities {
  email?: EmailCapability;
  phone?: PhoneCapability;
  browser?: BrowserCapability;
}

export interface EmailCapability {
  address: string;
  can_send: boolean;
  can_receive: boolean;
}

export interface PhoneCapability {
  number: string;
  sms_only: boolean;
}

export interface BrowserCapability {
  enabled: boolean;
  max_sessions: number;
}

export interface TrustInfo {
  score: number;
  level: "unverified" | "basic" | "verified" | "trusted";
  factors: TrustFactors;
}

export interface TrustFactors {
  owner_verified: boolean;
  email_verified: boolean;
  age_days: number;
  successful_auths: number;
  abuse_reports: number;
  external_attestations?: ExternalAttestation[];
}

export interface ExternalAttestation {
  source: string;
  attester_id: string;
  score: number;
  attested_at: string;
  signature?: string;
}

/**
 * MVA Credential — Minimum Viable Attestation for AI Agent Identity
 */
export interface MVACredential {
  version: '0.2';
  type: 'mva_credential';
  subject: {
    agent_id: string;
    passport_pubkey: string;
  };
  task: {
    task_hash: string;
    scope_hash: string;
    description?: string;
    contract_id?: string;
  };
  execution_context: {
    model_id?: string;
    temperature?: number;
    system_prompt_hash?: string;
  };
  action_hashes: string[];
  attestations: MVAAttestation[];
  delegation_proof?: MVADelegationProof;
  passport_sig: string;
  created_at: string;
}

export interface MVAAttestation {
  attester_id: string;
  attester_sig: string;
  score?: number;
  completion_ts: string;
}

export interface MVADelegationProof {
  delegator_id: string;
  scope: string[];
  scope_hash: string;
  liability_weight?: number;
  expires_at: string;
  delegator_sig: string;
}

export interface VaultInfo {
  services_count: number;
  encrypted: boolean;
  encryption: string;
}

export interface Permissions {
  max_registrations_per_day: number;
  allowed_domains: string[];
  blocked_domains: string[];
  requires_owner_approval: string[];
  auto_approved: string[];
}

export interface AuditInfo {
  total_actions: number;
  last_action: string;
  log_retention_days: number;
}

export interface AuditEntry {
  timestamp: string;
  agent: string;
  action: string;
  service: string;
  method: string;
  result: "success" | "failure" | "pending_approval" | "resolved_by_owner";
  duration_ms: number;
  details?: Record<string, unknown>;
}

export interface StoredCredential {
  service: string;
  username: string;
  password: string;
  email: string;
  cookies?: string;
  registered_at: string;
}

export interface AuthResult {
  success: boolean;
  method: "native" | "fallback_login" | "fallback_register";
  session_token?: string;
  error?: string;
  service: string;
}

export interface WebhookEvent {
  event: string;
  agent: {
    passport_id: string;
    name: string;
  };
  data: Record<string, unknown>;
  timestamp: string;
  actions?: WebhookAction[];
}

export interface WebhookAction {
  type: string;
  url?: string;
  callback?: string;
}
