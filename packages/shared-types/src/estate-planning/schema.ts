import { z } from "zod";

export const updateNomineeSchema = z.object({
  nomineeName: z.string().min(1).max(200).nullable(),
  nomineeRelationship: z.string().min(1).max(100).nullable(),
  nomineeContact: z.string().min(1).max(200).nullable(),
});
export type UpdateNomineeDto = z.infer<typeof updateNomineeSchema>;

export const createBeneficiarySchema = z.object({
  beneficiaryName: z.string().min(1).max(200),
  relationship: z.string().min(1).max(100),
  allocationPercent: z.number().min(0.01).max(100),
  trustName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateBeneficiaryDto = z.infer<typeof createBeneficiarySchema>;

export const updateBeneficiarySchema = createBeneficiarySchema.partial();
export type UpdateBeneficiaryDto = z.infer<typeof updateBeneficiarySchema>;

export interface EstateBeneficiaryDto {
  id: string;
  assetId: string;
  beneficiaryName: string;
  relationship: string;
  allocationPercent: number;
  trustName: string | null;
  notes: string | null;
  createdAt: string;
}

// ─── Asset-transfer checklist ────────────────────────────────────────────────

export const TRANSFER_CHECKLIST_STEP_TEMPLATE: ReadonlyArray<{ id: string; label: string }> = [
  { id: "notify_nominee", label: "Notify the nominee/beneficiary" },
  { id: "death_certificate", label: "Obtain death certificate / legal transfer order" },
  { id: "notify_institution", label: "Notify the bank/institution holding the asset" },
  { id: "update_ownership", label: "Update ownership records" },
  { id: "transfer_registration", label: "Transfer title/registration" },
  { id: "close_or_reissue", label: "Close or reissue the account" },
];

export interface TransferChecklistStep {
  id: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
  note: string | null;
}

export const toggleChecklistStepSchema = z.object({
  stepId: z.string().min(1),
  completed: z.boolean(),
  note: z.string().max(2000).optional(),
});
export type ToggleChecklistStepDto = z.infer<typeof toggleChecklistStepSchema>;

export interface AssetTransferChecklistDto {
  id: string;
  assetId: string;
  steps: TransferChecklistStep[];
  updatedAt: string;
}

// ─── Missing-nominee checklist (estate-planning landing page) ───────────────

export interface MissingNomineeAssetDto {
  id: string;
  name: string;
  type: string;
  currentValue: number;
  currencyCode: string;
  ownerUserId: string;
  ownerName: string | null;
  isJoint: boolean;
}
