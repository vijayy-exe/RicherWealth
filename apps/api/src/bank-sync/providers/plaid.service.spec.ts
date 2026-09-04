import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { PlaidService } from "./plaid.service";

const mockLinkTokenCreate = jest.fn();
const mockItemPublicTokenExchange = jest.fn();
const mockTransactionsSync = jest.fn();
const mockInstitutionsGetById = jest.fn();

jest.mock("plaid", () => {
  const actual = jest.requireActual("plaid");
  return {
    ...actual,
    PlaidApi: jest.fn().mockImplementation(() => ({
      linkTokenCreate: mockLinkTokenCreate,
      itemPublicTokenExchange: mockItemPublicTokenExchange,
      transactionsSync: mockTransactionsSync,
      institutionsGetById: mockInstitutionsGetById,
    })),
  };
});

function buildConfigService(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe("PlaidService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("when PLAID_CLIENT_ID/PLAID_SECRET are unset", () => {
    let service: PlaidService;
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [PlaidService, { provide: ConfigService, useValue: buildConfigService({}) }],
      }).compile();
      service = module.get(PlaidService);
    });

    it("reports itself as not configured", () => {
      expect(service.isConfigured()).toBe(false);
    });

    it("throws a clear ServiceUnavailableException instead of a raw Plaid SDK error", async () => {
      await expect(service.createLinkToken("user1")).rejects.toThrow(ServiceUnavailableException);
      await expect(service.createLinkToken("user1")).rejects.toThrow(/PLAID_CLIENT_ID/);
    });
  });

  describe("when configured (Sandbox credentials present)", () => {
    let service: PlaidService;
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PlaidService,
          {
            provide: ConfigService,
            useValue: buildConfigService({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret", PLAID_ENV: "sandbox" }),
          },
        ],
      }).compile();
      service = module.get(PlaidService);
    });

    it("reports itself as configured", () => {
      expect(service.isConfigured()).toBe(true);
    });

    it("creates a link token end-to-end (mocked Sandbox response)", async () => {
      mockLinkTokenCreate.mockResolvedValue({ data: { link_token: "link-sandbox-abc123" } });
      const token = await service.createLinkToken("user1");
      expect(token).toBe("link-sandbox-abc123");
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({ user: { client_user_id: "user1" }, client_name: "RicherWealth" }),
      );
    });

    it("exchanges a public token for an access token + item ID", async () => {
      mockItemPublicTokenExchange.mockResolvedValue({
        data: { access_token: "access-sandbox-xyz", item_id: "item-abc" },
      });
      const result = await service.exchangePublicToken("public-sandbox-abc123");
      expect(result).toEqual({ accessToken: "access-sandbox-xyz", itemId: "item-abc" });
    });

    it("pulls Sandbox test transactions end-to-end and normalizes them (sign flipped, dedup cursor returned)", async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [
            {
              transaction_id: "txn_1",
              date: "2026-08-05",
              amount: 5.75, // Plaid: positive = money OUT (an expense)
              merchant_name: "Starbucks",
              name: "STARBUCKS STORE 4521",
              iso_currency_code: "USD",
            },
            {
              transaction_id: "txn_2",
              date: "2026-08-01",
              amount: -3500, // Plaid: negative = money IN (a deposit/income)
              merchant_name: null,
              name: "PAYROLL DEPOSIT ACME CORP",
              iso_currency_code: "USD",
            },
          ],
          modified: [],
          removed: [{ transaction_id: "txn_old" }],
          next_cursor: "cursor-2",
          has_more: false,
        },
      });

      const result = await service.syncTransactions("access-sandbox-xyz", null);

      expect(result.added).toHaveLength(2);
      // Sign convention flipped to match NormalizedBankTransaction (positive = credit/income).
      expect(result.added[0]).toMatchObject({ merchant: "Starbucks", amount: -5.75, externalId: "txn_1" });
      expect(result.added[1]).toMatchObject({ merchant: "PAYROLL DEPOSIT ACME CORP", amount: 3500, externalId: "txn_2" });
      expect(result.removedExternalIds).toEqual(["txn_old"]);
      expect(result.nextCursor).toBe("cursor-2");
      expect(result.hasMore).toBe(false);
      expect(mockTransactionsSync).toHaveBeenCalledWith({ access_token: "access-sandbox-xyz" });
    });

    it("passes the stored cursor through on incremental syncs", async () => {
      mockTransactionsSync.mockResolvedValue({ data: { added: [], modified: [], removed: [], next_cursor: "c2", has_more: false } });
      await service.syncTransactions("access-sandbox-xyz", "cursor-1");
      expect(mockTransactionsSync).toHaveBeenCalledWith({ access_token: "access-sandbox-xyz", cursor: "cursor-1" });
    });
  });
});
