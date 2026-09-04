import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import type { NormalizedBankTransaction } from "./normalized-transaction";

export interface PlaidSyncResult {
  added: NormalizedBankTransaction[];
  /** Plaid transaction_ids that were removed since the last sync (e.g. a pending charge that was voided) — the caller should delete matching Transaction rows. */
  removedExternalIds: string[];
  nextCursor: string;
  hasMore: boolean;
}

/**
 * US/EU reference implementation of bank sync, via Plaid Sandbox (free for
 * dev). Every method that talks to Plaid normalizes its output to
 * `NormalizedBankTransaction` — the same contract CSV/PDF import produce —
 * so `BankSyncService` and everything downstream (categorization, dedup,
 * Transaction persistence) doesn't care which provider a transaction came from.
 */
@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private readonly client: PlaidApi | null;

  constructor(private readonly config: ConfigService) {
    const clientId = this.config.get<string>("PLAID_CLIENT_ID");
    const secret = this.config.get<string>("PLAID_SECRET");
    const env = this.config.get<string>("PLAID_ENV") ?? "sandbox";

    if (!clientId || !secret) {
      this.logger.warn("PLAID_CLIENT_ID/PLAID_SECRET not set — Plaid bank sync is disabled until configured.");
      this.client = null;
      return;
    }

    // PlaidEnvironments is typed with a generic string index signature, so even
    // a literal-key lookup comes back `string | undefined` — the three
    // environment keys are always present in the real SDK, hence the assertion.
    const basePath = (PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments["sandbox"])!;
    const configuration = new Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });
    this.client = new PlaidApi(configuration);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private requireClient(): PlaidApi {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Plaid isn't configured — set PLAID_CLIENT_ID and PLAID_SECRET (Sandbox credentials from dashboard.plaid.com) in apps/api/.env",
      );
    }
    return this.client;
  }

  /** Create a Link token for the frontend to launch Plaid Link with (react-plaid-link's usePlaidLink). */
  async createLinkToken(userId: string): Promise<string> {
    const client = this.requireClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "RicherWealth",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return response.data.link_token;
  }

  /** Exchange the public_token Plaid Link returns on success for a durable access_token + item_id. */
  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const client = this.requireClient();
    const response = await client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: response.data.access_token, itemId: response.data.item_id };
  }

  async getInstitutionName(institutionId: string): Promise<string | null> {
    const client = this.requireClient();
    try {
      const response = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      return response.data.institution.name;
    } catch (err) {
      this.logger.warn(`Could not fetch institution name for ${institutionId}`, err);
      return null;
    }
  }

  /**
   * Plaid's incremental transactions/sync endpoint — pass the cursor from
   * the previous call (null on first sync) and it returns only what
   * changed since then.
   */
  async syncTransactions(accessToken: string, cursor: string | null): Promise<PlaidSyncResult> {
    const client = this.requireClient();
    let response;
    try {
      response = await client.transactionsSync({
        access_token: accessToken,
        ...(cursor && { cursor }),
      });
    } catch (err) {
      throw new BadRequestException(`Plaid transactions/sync failed: ${(err as Error).message}`);
    }

    const { added, removed, next_cursor, has_more } = response.data;

    return {
      added: added.map(
        (t): NormalizedBankTransaction => ({
          date: new Date(t.date),
          // Plaid convention: positive amount = money OUT of the account (an expense).
          // NormalizedBankTransaction convention: positive = credit/income. Flip the sign.
          amount: -t.amount,
          merchant: t.merchant_name ?? t.name,
          description: t.name,
          currencyCode: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
          externalId: t.transaction_id,
        }),
      ),
      removedExternalIds: removed.map((r) => r.transaction_id).filter((id): id is string => !!id),
      nextCursor: next_cursor,
      hasMore: has_more,
    };
  }
}
