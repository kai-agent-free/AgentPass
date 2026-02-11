const DEFAULT_DOMAIN = 'agentpass.dev';

/**
 * Generate an email address for an agent.
 * Sanitizes the agent name to lowercase alphanumeric + hyphens.
 */
export function generateEmailAddress(
  agentName: string,
  domain: string = DEFAULT_DOMAIN,
): string {
  const sanitized = agentName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (sanitized.length === 0) {
    throw new Error('Agent name must contain at least one alphanumeric character');
  }

  return `${sanitized}@${domain}`;
}

/**
 * Validate that an email string matches the agent email format:
 *   local-part@domain where local-part is lowercase alphanumeric + hyphens.
 */
export function isValidAgentEmail(email: string): boolean {
  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
  return pattern.test(email);
}
