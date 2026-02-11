/**
 * Credential management service.
 *
 * Stores and retrieves service credentials associated with an agent identity.
 * Currently uses an in-memory Map; a persistent encrypted vault will replace this.
 */

export interface Credential {
  service: string;
  username: string;
  password: string;
  email: string;
  stored_at: string;
}

export interface CredentialSummary {
  service: string;
  username: string;
  email: string;
  stored_at: string;
}

export class CredentialService {
  /** Map<passport_id, Map<service, Credential>> */
  private vaults = new Map<string, Map<string, Credential>>();

  /**
   * Store a credential for a given identity and service.
   *
   * Overwrites any existing credential for the same service.
   */
  storeCredential(input: {
    passport_id: string;
    service: string;
    username: string;
    password: string;
    email: string;
  }): Credential {
    let vault = this.vaults.get(input.passport_id);
    if (!vault) {
      vault = new Map();
      this.vaults.set(input.passport_id, vault);
    }

    const credential: Credential = {
      service: input.service,
      username: input.username,
      password: input.password,
      email: input.email,
      stored_at: new Date().toISOString(),
    };

    vault.set(input.service, credential);
    return credential;
  }

  /**
   * Retrieve a credential for a given identity and service.
   */
  getCredential(passportId: string, service: string): Credential | null {
    const vault = this.vaults.get(passportId);
    if (!vault) {
      return null;
    }
    return vault.get(service) ?? null;
  }

  /**
   * List all credentials for an identity (summaries only, no passwords).
   */
  listCredentials(passportId: string): CredentialSummary[] {
    const vault = this.vaults.get(passportId);
    if (!vault) {
      return [];
    }

    const result: CredentialSummary[] = [];
    for (const cred of vault.values()) {
      result.push({
        service: cred.service,
        username: cred.username,
        email: cred.email,
        stored_at: cred.stored_at,
      });
    }
    return result;
  }

  /**
   * Delete a credential for a given identity and service.
   */
  deleteCredential(passportId: string, service: string): boolean {
    const vault = this.vaults.get(passportId);
    if (!vault) {
      return false;
    }
    return vault.delete(service);
  }
}
