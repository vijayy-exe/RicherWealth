import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Phase 22: k6 load test for the dashboard-summary (GraphQL) and
 * price-sync (REST, cache-backed) endpoints — nothing like this existed
 * before this phase (confirmed: no k6 anywhere in the repo).
 *
 * Uses N real, Admin-API-created Supabase users (not one shared
 * dev-token) so this genuinely measures concurrent-USER load rather than
 * one account serially hammering itself — Phase 22's own AppThrottlerGuard
 * fix (rate-limit bucket keyed by user, not shared IP) is exactly what
 * makes that distinction meaningful; before that fix every VU behind this
 * machine's one IP would have throttled every other VU.
 *
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *      k6 run load-test/dashboard-price-sync.js
 * (same .env values apps/api/apps/web already use)
 */

const API_URL = __ENV.API_URL || "http://localhost:4000";
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const USER_COUNT = 15; // kept under AppThrottlerGuard's 100/min-per-user limit at this VU count/duration
const RUN_ID = `${Date.now()}`;

export const options = {
  scenarios: {
    dashboard_and_price: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 15 },
        { duration: "40s", target: 15 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    // Acceptance bar: p95 dashboard latency stays reasonable under realistic concurrent load.
    "http_req_duration{endpoint:dashboardSummary}": ["p(95)<1500"],
    "http_req_duration{endpoint:priceSync}": ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

function supabaseAdminHeaders() {
  return { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" };
}

export function setup() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY must be set — see apps/api/.env");
  }

  const tokens = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const email = `k6-load-${RUN_ID}-${i}@richerwealth.test`;
    const password = "K6-load-test-password-123!";

    const createRes = http.post(
      `${SUPABASE_URL}/auth/v1/admin/users`,
      JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: `k6 VU ${i}` } }),
      { headers: supabaseAdminHeaders() },
    );
    if (createRes.status >= 300) {
      throw new Error(`Failed to create k6 test user ${email}: ${createRes.status} ${createRes.body}`);
    }
    const userId = JSON.parse(createRes.body).id;

    http.post(`${API_URL}/api/auth/sync-user`, JSON.stringify({ supabaseId: userId, email, name: `k6 VU ${i}` }), {
      headers: { "Content-Type": "application/json" },
    });

    const loginRes = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email, password }),
      { headers: { apikey: ANON_KEY, "Content-Type": "application/json" } },
    );
    if (loginRes.status >= 300) {
      throw new Error(`Failed to log in k6 test user ${email}: ${loginRes.status} ${loginRes.body}`);
    }
    tokens.push({ userId, email, accessToken: JSON.parse(loginRes.body).access_token });
  }

  return { tokens };
}

export default function (data) {
  const account = data.tokens[__VU % data.tokens.length];
  const headers = { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" };

  const dashboardRes = http.post(
    `${API_URL}/graphql`,
    JSON.stringify({ query: "{ dashboardSummary { totalNetWorth debtRatio } }" }),
    { headers, tags: { endpoint: "dashboardSummary" } },
  );
  check(dashboardRes, {
    "dashboard: status 200": (r) => r.status === 200,
    "dashboard: no GraphQL errors": (r) => !JSON.parse(r.body).errors,
  });

  const priceRes = http.get(`${API_URL}/api/stocks/price/NASDAQ/AAPL`, { headers, tags: { endpoint: "priceSync" } });
  check(priceRes, { "price: status 200": (r) => r.status === 200 });

  sleep(1); // a real user doesn't poll in a tight loop
}

export function teardown(data) {
  for (const account of data.tokens) {
    http.del(`${SUPABASE_URL}/auth/v1/admin/users/${account.userId}`, null, { headers: supabaseAdminHeaders() });
  }
  // The app's own Postgres `users` row isn't deleted here (k6 has no
  // Postgres client) — cleaned up afterward via the same
  // `DELETE FROM users WHERE email LIKE 'k6-load-%'` this repo's E2E
  // suite already uses for its own test users.
}
