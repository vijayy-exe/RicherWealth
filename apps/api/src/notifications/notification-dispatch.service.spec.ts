/**
 * NotificationDispatchService is the whole idempotency + per-channel
 * preference-gating contract for Phase 17. Mocked Prisma (same in-memory
 * array + jest.fn() pattern as capital-gains.service.spec.ts), a real
 * unique-constraint check reproduced in the mock's `create` so the test
 * exercises the actual P2002-retry logic, not just that create was called.
 */
import { NotificationDispatchService, type NotifyOnceParams } from "./notification-dispatch.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationPushService } from "./delivery/push.service";
import { NotificationEmailService } from "./delivery/email.service";

interface FakeNotification {
  id: string;
  userId: string;
  type: string;
  sourceEntityId: string;
  triggerBucket: string;
  deliveryResult: unknown;
}

function makeMockPrisma() {
  const rows: FakeNotification[] = [];
  let idCounter = 0;

  return {
    rows,
    notification: {
      create: jest.fn((args: { data: Omit<FakeNotification, "id"> }) => {
        const dup = rows.find(
          (r) =>
            r.userId === args.data.userId &&
            r.type === args.data.type &&
            r.sourceEntityId === args.data.sourceEntityId &&
            r.triggerBucket === args.data.triggerBucket,
        );
        if (dup) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: FakeNotification = { id: `n${++idCounter}`, ...args.data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn((args: { where: { id: string }; data: Partial<FakeNotification> }) => {
        const row = rows.find((r) => r.id === args.where.id)!;
        Object.assign(row, args.data);
        return Promise.resolve(row);
      }),
    },
    user: {
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          email: "user@example.com",
          notifyQuietHoursStart: null,
          notifyQuietHoursEnd: null,
          notifyQuietHoursTimezone: "UTC",
        }),
      ),
    },
  };
}

describe("NotificationDispatchService", () => {
  const baseParams: NotifyOnceParams = {
    userId: "user-1",
    type: "CRYPTO_PRICE_ALERT" as never,
    title: "BTC hit target",
    body: "Bitcoin reached your target price.",
    sourceEntityId: "alert-1",
    triggerBucket: "ONCE",
  };

  function makeService(prefs: { inAppEnabled: boolean; pushEnabled: boolean; emailEnabled: boolean }) {
    const mockPrisma = makeMockPrisma();
    const preferences = { getEffective: jest.fn().mockResolvedValue(prefs) } as unknown as NotificationPreferenceService;
    const push = { send: jest.fn().mockResolvedValue(true) } as unknown as NotificationPushService;
    const email = { send: jest.fn().mockResolvedValue(true) } as unknown as NotificationEmailService;
    const service = new NotificationDispatchService(mockPrisma as never, preferences, push, email);
    return { service, mockPrisma, push, email };
  }

  it("creates a notification and attempts delivery on every enabled channel — acceptance criterion", async () => {
    const { service, mockPrisma, push, email } = makeService({ inAppEnabled: true, pushEnabled: true, emailEnabled: true });

    const result = await service.notifyOnce(baseParams);

    expect(result.created).toBe(true);
    expect(mockPrisma.rows).toHaveLength(1);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    const deliveryResult = mockPrisma.rows[0]!.deliveryResult as Record<string, string>;
    expect(deliveryResult["IN_APP"]).toBe("SENT");
    expect(deliveryResult["PUSH"]).toBe("SENT");
    expect(deliveryResult["EMAIL"]).toBe("SENT");
  });

  it("disabling ONE channel suppresses delivery on only that channel — acceptance criterion", async () => {
    // in-app + email enabled, push disabled
    const { service, mockPrisma, push, email } = makeService({ inAppEnabled: true, pushEnabled: false, emailEnabled: true });

    await service.notifyOnce(baseParams);

    expect(push.send).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
    const deliveryResult = mockPrisma.rows[0]!.deliveryResult as Record<string, string>;
    expect(deliveryResult["PUSH"]).toBe("SKIPPED_BY_PREFERENCE");
    expect(deliveryResult["EMAIL"]).toBe("SENT");
    expect(deliveryResult["IN_APP"]).toBe("SENT");
  });

  it("never fires a duplicate notification for the same event across repeated evaluator runs — idempotency acceptance criterion", async () => {
    const { service, mockPrisma, push, email } = makeService({ inAppEnabled: true, pushEnabled: true, emailEnabled: true });

    const first = await service.notifyOnce(baseParams);
    const second = await service.notifyOnce(baseParams); // simulates a second overlapping job run for the same event

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(mockPrisma.rows).toHaveLength(1); // exactly one row, not two
    expect(push.send).toHaveBeenCalledTimes(1); // delivery was NOT attempted twice
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("a different triggerBucket for the same event IS allowed to notify again (e.g. a new day)", async () => {
    const { service, mockPrisma } = makeService({ inAppEnabled: true, pushEnabled: false, emailEnabled: false });

    await service.notifyOnce({ ...baseParams, triggerBucket: "2026-09-01" });
    await service.notifyOnce({ ...baseParams, triggerBucket: "2026-09-02" });

    expect(mockPrisma.rows).toHaveLength(2);
  });

  it("in-app is gated by preference too, independent of push/email", async () => {
    const { mockPrisma, service } = makeService({ inAppEnabled: false, pushEnabled: false, emailEnabled: false });
    await service.notifyOnce(baseParams);
    const deliveryResult = mockPrisma.rows[0]!.deliveryResult as Record<string, string>;
    expect(deliveryResult["IN_APP"]).toBe("SKIPPED_BY_PREFERENCE");
  });
});
