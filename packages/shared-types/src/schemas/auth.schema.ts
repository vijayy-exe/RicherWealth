import { z } from "zod";

// ─── Onboarding ───────────────────────────────────────────────────────────────

export const TrackingPreferenceSchema = z.enum([
  "stocks",
  "mutual_funds",
  "crypto",
  "real_estate",
  "gold",
  "retirement",
  "insurance",
  "business",
  "other",
]);

export const OnboardingInputSchema = z.object({
  baseCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, "Must be a valid ISO 4217 currency code (e.g. USD, INR)"),
  trackingPreferences: z.array(TrackingPreferenceSchema).min(1, "Pick at least one"),
});

export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
export type TrackingPreference = z.infer<typeof TrackingPreferenceSchema>;

// ─── Profile Update ───────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  baseCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ─── Auth user (returned from API /auth/me) ───────────────────────────────────

export const AuthUserSchema = z.object({
  id: z.string(),
  supabaseId: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  baseCurrency: z.string(),
  mfaEnabled: z.boolean(),
  onboardingCompleted: z.boolean(),
  trackingPreferences: z.array(TrackingPreferenceSchema),
  createdAt: z.string().datetime(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

// ─── Session ──────────────────────────────────────────────────────────────────

export const SessionSchema = z.object({
  id: z.string(),
  deviceName: z.string().nullable(),
  deviceType: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export type SessionRecord = z.infer<typeof SessionSchema>;
