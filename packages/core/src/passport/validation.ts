import { z } from "zod";

const PASSPORT_ID_REGEX = /^ap_[a-z0-9]{12}$/;

export const PassportIdSchema = z
  .string()
  .regex(PASSPORT_ID_REGEX, "Invalid passport ID format (expected ap_xxxxxxxxxxxx)");

export const PassportIdentitySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name must be 64 characters or fewer")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Name must contain only alphanumeric characters, hyphens, and underscores",
    ),
  description: z
    .string()
    .max(256, "Description must be 256 characters or fewer")
    .default(""),
  public_key: z.string().min(1, "Public key is required"),
  created_at: z.string().datetime(),
});

export const PassportOwnerSchema = z.object({
  id: z.string().min(1),
  email: z.string().email("Invalid owner email"),
  verified: z.boolean().default(false),
});

export const EmailCapabilitySchema = z.object({
  address: z.string().email(),
  can_send: z.boolean().default(false),
  can_receive: z.boolean().default(true),
});

export const PhoneCapabilitySchema = z.object({
  number: z.string().min(1),
  sms_only: z.boolean().default(true),
});

export const BrowserCapabilitySchema = z.object({
  enabled: z.boolean().default(true),
  max_sessions: z.number().int().min(1).max(10).default(3),
});

export const PassportCapabilitiesSchema = z.object({
  email: EmailCapabilitySchema.optional(),
  phone: PhoneCapabilitySchema.optional(),
  browser: BrowserCapabilitySchema.optional(),
});

export const PermissionsSchema = z.object({
  max_registrations_per_day: z.number().int().min(0).max(100).default(10),
  allowed_domains: z.array(z.string()).default([]),
  blocked_domains: z.array(z.string()).default([]),
  requires_owner_approval: z.array(z.string()).default([]),
  auto_approved: z.array(z.string()).default(["*"]),
});

export const CreatePassportInputSchema = z.object({
  name: PassportIdentitySchema.shape.name,
  description: z
    .string()
    .max(256, "Description must be 256 characters or fewer")
    .optional()
    .default(""),
  owner_email: z.string().email("Invalid owner email"),
  capabilities: PassportCapabilitiesSchema.optional(),
  permissions: PermissionsSchema.optional(),
});

export type CreatePassportInput = z.infer<typeof CreatePassportInputSchema>;
