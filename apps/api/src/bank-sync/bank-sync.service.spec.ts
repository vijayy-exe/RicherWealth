import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { BankSyncService } from "./bank-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionsService } from "../transactions/transactions.service";
import { PlaidService } from "./providers/plaid.service";
import { CsvImportProvider } from "./providers/csv-import.provider";
import { PdfImportProvider } from "./providers/pdf-import.provider";

const ENCRYPTION_KEY = "a".repeat(64); // valid 32-byte hex key

const mockPrisma = {
  plaidItem: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  transaction: { deleteMany: jest.fn() },
};

const mockConfig = { get: (key: string) => (key === "PLAID_TOKEN_ENCRYPTION_KEY" ? ENCRYPTION_KEY : undefined) };

const mockTransactions = { bulkIngest: jest.fn() };
const mockPlaid = {
  isConfigured: jest.fn(() => true),
  createLinkToken: jest.fn(),
  exchangePublicToken: jest.fn(),
  syncTransactions: jest.fn(),
};
const mockCsvImport = { supportedExtensions: [".csv"], parse: jest.fn() };
const mockPdfImport = { supportedExtensions: [".pdf"], parse: jest.fn() };

describe("BankSyncService", () => {
  let service: BankSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TransactionsService, useValue: mockTransactions },
        { provide: PlaidService, useValue: mockPlaid },
        { provide: CsvImportProvider, useValue: mockCsvImport },
        { provide: PdfImportProvider, useValue: mockPdfImport },
      ],
    }).compile();
    service = module.get(BankSyncService);
    jest.clearAllMocks();
  });

  describe("exchangePlaidPublicToken", () => {
    it("exchanges the public token, encrypts the access token at rest, and kicks off an initial sync", async () => {
      mockPlaid.exchangePublicToken.mockResolvedValue({ accessToken: "access-sandbox-xyz", itemId: "item-abc" });
      mockPrisma.plaidItem.create.mockResolvedValue({
        id: "db1", institutionName: "Sandbox Bank", status: "ACTIVE", lastSyncedAt: null, createdAt: new Date(),
      });
      mockPrisma.plaidItem.findUnique.mockResolvedValue({
        id: "db1", userId: "user1", accessTokenEncrypted: "irrelevant-for-this-assertion", cursor: null,
      });
      mockPlaid.syncTransactions.mockResolvedValue({ added: [], removedExternalIds: [], nextCursor: "c1", hasMore: false });
      mockTransactions.bulkIngest.mockResolvedValue({ created: 0, skippedDuplicates: 0 });

      const result = await service.exchangePlaidPublicToken("user1", {
        publicToken: "public-sandbox-abc",
        institutionName: "Sandbox Bank",
      });

      expect(result.institutionName).toBe("Sandbox Bank");
      const createCall = mockPrisma.plaidItem.create.mock.calls[0][0];
      expect(createCall.data.accessTokenEncrypted).not.toBe("access-sandbox-xyz");
      expect(createCall.data.accessTokenEncrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext
      expect(createCall.data.itemId).toBe("item-abc");
    });
  });

  describe("syncPlaidItem", () => {
    it("pulls Sandbox test transactions end-to-end: decrypts the token, ingests added rows, deletes removed rows, and advances the cursor", async () => {
      const { encryptSecret } = jest.requireActual("../auth/crypto.util");
      const encrypted = encryptSecret("access-sandbox-xyz", ENCRYPTION_KEY);

      mockPrisma.plaidItem.findUnique.mockResolvedValue({
        id: "db1", userId: "user1", accessTokenEncrypted: encrypted, cursor: null,
      });
      mockPlaid.syncTransactions.mockResolvedValueOnce({
        added: [{ date: new Date("2026-08-01"), amount: -5.75, merchant: "STARBUCKS", currencyCode: "USD", externalId: "txn_1" }],
        removedExternalIds: ["txn_old"],
        nextCursor: "cursor-1",
        hasMore: false,
      });
      mockTransactions.bulkIngest.mockResolvedValue({ created: 1, skippedDuplicates: 0 });
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.syncPlaidItem("user1", "db1");

      expect(result).toEqual({ created: 1, skippedDuplicates: 0, removed: 1 });
      // Decrypted correctly and passed the real plaintext token through to the Plaid client.
      expect(mockPlaid.syncTransactions).toHaveBeenCalledWith("access-sandbox-xyz", null);
      expect(mockTransactions.bulkIngest).toHaveBeenCalledWith(
        "user1",
        expect.arrayContaining([expect.objectContaining({ merchant: "STARBUCKS" })]),
        "bank_sync",
      );
      expect(mockPrisma.plaidItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cursor: "cursor-1", status: "ACTIVE" }) }),
      );
    });

    it("loops through paginated sync pages until hasMore is false", async () => {
      const { encryptSecret } = jest.requireActual("../auth/crypto.util");
      const encrypted = encryptSecret("access-sandbox-xyz", ENCRYPTION_KEY);
      mockPrisma.plaidItem.findUnique.mockResolvedValue({ id: "db1", userId: "user1", accessTokenEncrypted: encrypted, cursor: null });
      mockPlaid.syncTransactions
        .mockResolvedValueOnce({ added: [], removedExternalIds: [], nextCursor: "c1", hasMore: true })
        .mockResolvedValueOnce({ added: [], removedExternalIds: [], nextCursor: "c2", hasMore: false });
      mockTransactions.bulkIngest.mockResolvedValue({ created: 0, skippedDuplicates: 0 });

      await service.syncPlaidItem("user1", "db1");

      expect(mockPlaid.syncTransactions).toHaveBeenCalledTimes(2);
      expect(mockPlaid.syncTransactions).toHaveBeenNthCalledWith(2, "access-sandbox-xyz", "c1");
    });

    it("rejects a sync for a Plaid item owned by another user", async () => {
      mockPrisma.plaidItem.findUnique.mockResolvedValue({ id: "db1", userId: "someone-else" });
      await expect(service.syncPlaidItem("user1", "db1")).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException for a missing item", async () => {
      mockPrisma.plaidItem.findUnique.mockResolvedValue(null);
      await expect(service.syncPlaidItem("user1", "missing")).rejects.toThrow(NotFoundException);
    });

    it("marks the item ERROR and rethrows when Plaid sync fails", async () => {
      const { encryptSecret } = jest.requireActual("../auth/crypto.util");
      const encrypted = encryptSecret("access-sandbox-xyz", ENCRYPTION_KEY);
      mockPrisma.plaidItem.findUnique.mockResolvedValue({ id: "db1", userId: "user1", accessTokenEncrypted: encrypted, cursor: null });
      mockPlaid.syncTransactions.mockRejectedValue(new Error("ITEM_LOGIN_REQUIRED"));

      await expect(service.syncPlaidItem("user1", "db1")).rejects.toThrow("ITEM_LOGIN_REQUIRED");
      expect(mockPrisma.plaidItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ERROR" } }));
    });
  });

  describe("importStatement", () => {
    it("dispatches a .csv file to the CSV provider", async () => {
      mockCsvImport.parse.mockResolvedValue([{ date: new Date(), amount: -5, merchant: "TEST", currencyCode: "USD" }]);
      mockTransactions.bulkIngest.mockResolvedValue({ created: 1, skippedDuplicates: 0 });

      const result = await service.importStatement("user1", { buffer: Buffer.from(""), originalname: "statement.csv" }, "USD");

      expect(mockCsvImport.parse).toHaveBeenCalled();
      expect(mockPdfImport.parse).not.toHaveBeenCalled();
      expect(result).toEqual({ created: 1, skippedDuplicates: 0, removed: 0 });
    });

    it("dispatches a .pdf file to the PDF provider", async () => {
      mockPdfImport.parse.mockResolvedValue([]);
      mockTransactions.bulkIngest.mockResolvedValue({ created: 0, skippedDuplicates: 0 });

      await service.importStatement("user1", { buffer: Buffer.from(""), originalname: "statement.PDF" }, "USD");

      expect(mockPdfImport.parse).toHaveBeenCalled();
      expect(mockCsvImport.parse).not.toHaveBeenCalled();
    });

    it("rejects an unsupported file extension", async () => {
      await expect(
        service.importStatement("user1", { buffer: Buffer.from(""), originalname: "statement.xlsx" }, "USD"),
      ).rejects.toThrow(/Unsupported file type/);
    });
  });
});
