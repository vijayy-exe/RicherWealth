/**
 * RicherWealth — Demo Seed Script
 * Creates a realistic demo user with diverse assets, liabilities, and 12 months of snapshots.
 *
 * Run: pnpm --filter @richer/api prisma:seed
 *      or: cd apps/api && ts-node prisma/seed.ts
 */

import { PrismaClient, AssetType, LiabilityType } from "@prisma/client";

const prisma = new PrismaClient();

// Hard-coded FX rates (USD base)
const FX: Record<string, number> = { USD: 1, INR: 83.5 };
function toINR(usd: number) { return usd * FX["INR"]!; }

const DEMO_USER = {
  supabaseId: "demo-supabase-id-seed-001",
  email: "demo@richer.local",
  name: "Demo User",
  baseCurrency: "INR",
  onboardingCompleted: true,
  trackingPreferences: ["stocks", "crypto", "real_estate", "gold", "mutual_funds"],
};

// Assets in INR
const ASSETS: Array<{
  type: AssetType;
  name: string;
  currentValue: number;
  currencyCode: string;
  details: Record<string, string | number | boolean>;
}> = [
  { type: AssetType.STOCK, name: "HDFC Bank", currentValue: 1_250_000, currencyCode: "INR", details: { ticker: "HDFCBANK", exchange: "NSE", quantity: 50, avgBuyPrice: 1400 } },
  { type: AssetType.STOCK, name: "TCS", currentValue: 980_000, currencyCode: "INR", details: { ticker: "TCS", exchange: "NSE", quantity: 25, avgBuyPrice: 3400 } },
  { type: AssetType.STOCK, name: "Infosys", currentValue: 540_000, currencyCode: "INR", details: { ticker: "INFY", exchange: "NSE", quantity: 40, avgBuyPrice: 1200 } },
  { type: AssetType.MUTUAL_FUND, name: "Parag Parikh Flexi Cap Fund", currentValue: 2_100_000, currencyCode: "INR", details: { isin: "INF879O01027", nav: 72.5, units: 28966 } },
  { type: AssetType.CRYPTO, name: "Bitcoin", currentValue: toINR(5000), currencyCode: "INR", details: { symbol: "BTC", quantity: 0.08, avgBuyPrice: toINR(45000) } },
  { type: AssetType.CRYPTO, name: "Ethereum", currentValue: toINR(2000), currencyCode: "INR", details: { symbol: "ETH", quantity: 0.6, avgBuyPrice: toINR(2800) } },
  { type: AssetType.GOLD, name: "Digital Gold", currentValue: 650_000, currencyCode: "INR", details: { grams: 100, platform: "Zerodha" } },
  { type: AssetType.REAL_ESTATE, name: "Apartment - Bangalore", currentValue: 8_500_000, currencyCode: "INR", details: { area_sqft: 1200, location: "Whitefield, Bangalore", purchasePrice: 6_500_000 } },
  { type: AssetType.FIXED_DEPOSIT, name: "HDFC FD", currentValue: 1_000_000, currencyCode: "INR", details: { bank: "HDFC", interestRate: 7.1, maturityDate: "2026-03-01" } },
  { type: AssetType.CASH, name: "Savings Account", currentValue: 350_000, currencyCode: "INR", details: { bank: "HDFC", accountType: "savings" } },
];

// Liabilities in INR
const LIABILITIES: Array<{
  type: LiabilityType;
  name: string;
  principalAmount: number;
  remainingBalance: number;
  interestRate: number;
  currencyCode: string;
  emiAmount?: number;
}> = [
  {
    type: LiabilityType.MORTGAGE,
    name: "Home Loan — Bangalore Apartment",
    principalAmount: 5_500_000,
    remainingBalance: 4_200_000,
    interestRate: 8.5,
    currencyCode: "INR",
    emiAmount: 48_500,
  },
  {
    type: LiabilityType.CAR_LOAN,
    name: "Car Loan — Honda City",
    principalAmount: 850_000,
    remainingBalance: 320_000,
    interestRate: 9.2,
    currencyCode: "INR",
    emiAmount: 17_200,
  },
];

async function generateSnapshots(userId: string, currentNetWorth: number) {
  const snapshots = [];
  const today = new Date();

  // Generate 13 months of data (realistic growth curve)
  for (let i = 12; i >= 0; i--) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);

    // Simulate growth: ~2% per month with some noise
    const growthFactor = Math.pow(1.02, i);
    const noise = 1 + (Math.random() - 0.5) * 0.04;
    const netWorthAtTime = currentNetWorth / growthFactor / noise;

    const totalAssetsAtTime = netWorthAtTime * 1.35; // assets ~ 1.35x of net worth
    const totalLiabilitiesAtTime = totalAssetsAtTime - netWorthAtTime;

    snapshots.push({
      userId,
      totalAssets: totalAssetsAtTime.toFixed(6),
      totalLiabilities: totalLiabilitiesAtTime.toFixed(6),
      netWorth: netWorthAtTime.toFixed(6),
      baseCurrency: "INR",
      snapshotDate: date,
    });
  }
  return snapshots;
}

async function main() {
  console.log("🌱 Starting seed...");

  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { supabaseId: DEMO_USER.supabaseId },
    update: { name: DEMO_USER.name, onboardingCompleted: true },
    create: DEMO_USER,
  });
  console.log(`✅ Demo user: ${user.email} (${user.id})`);

  // Clear existing seeded data
  await prisma.netWorthSnapshot.deleteMany({ where: { userId: user.id } });
  await prisma.asset.deleteMany({ where: { userId: user.id } });
  await prisma.liability.deleteMany({ where: { userId: user.id } });

  // Create assets
  for (const asset of ASSETS) {
    await prisma.asset.create({
      data: { userId: user.id, ...asset, details: asset.details as object, currentValue: asset.currentValue.toFixed(6) },
    });
  }
  console.log(`✅ Created ${ASSETS.length} assets`);

  // Create liabilities
  for (const liability of LIABILITIES) {
    await prisma.liability.create({
      data: {
        userId: user.id,
        ...liability,
        principalAmount: liability.principalAmount.toFixed(6),
        remainingBalance: liability.remainingBalance.toFixed(6),
        interestRate: liability.interestRate.toFixed(4),
        ...(liability.emiAmount ? { emiAmount: liability.emiAmount.toFixed(6) } : {}),
      },
    });
  }
  console.log(`✅ Created ${LIABILITIES.length} liabilities`);

  // Calculate current net worth
  const totalAssets = ASSETS.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = LIABILITIES.reduce((sum, l) => sum + l.remainingBalance, 0);
  const netWorth = totalAssets - totalLiabilities;
  console.log(`📊 Net worth: ₹${(netWorth / 100000).toFixed(2)}L`);

  // Create 12-month snapshots
  const snapshots = await generateSnapshots(user.id, netWorth);
  await prisma.netWorthSnapshot.createMany({ data: snapshots, skipDuplicates: true });
  console.log(`✅ Created ${snapshots.length} monthly snapshots`);

  console.log("\n🎉 Seed complete!");
  console.log(`   User: ${DEMO_USER.email}`);
  console.log(`   Total Assets: ₹${(totalAssets / 100000).toFixed(2)}L`);
  console.log(`   Total Liabilities: ₹${(totalLiabilities / 100000).toFixed(2)}L`);
  console.log(`   Net Worth: ₹${(netWorth / 100000).toFixed(2)}L`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
