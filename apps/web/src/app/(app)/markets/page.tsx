"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { RefreshCw, TrendingUp, TrendingDown, Newspaper, Calendar, Globe2 } from "lucide-react";

import {
  useIndices,
  useCurrencies,
  useCryptoMarket,
  useCommoditiesMarket,
  useMyMovers,
  useEconomicCalendar,
  type CurrencyQuote,
} from "@/hooks/useMarketIntelligence";
import { useGeneralNews, usePersonalizedNews } from "@/hooks/useNews";
import type { MarketQuote, HoldingMoverQuote, NewsArticle, EconomicIndicator } from "@richer/shared-types";

// ─── Formatting helpers (mirrors stocks/page.tsx conventions) ────────────────

function fmtPrice(value: number, currency = "USD"): string {
  return value.toLocaleString(undefined, {
    style: currency.length === 3 ? "currency" : undefined,
    currency: currency.length === 3 ? currency : undefined,
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 10 ? 4 : 2,
  });
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>—</span>;
  }
  const positive = value >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      color: positive ? "var(--color-gain)" : "var(--color-loss)",
      fontSize: "0.8rem", fontWeight: 600,
    }}>
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {fmtPct(value)}
    </span>
  );
}

function LiveBadge({ isLive }: { isLive: boolean }) {
  return (
    <span style={{
      fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em",
      padding: "2px 6px", borderRadius: "var(--radius-full)",
      color: isLive ? "var(--color-gain)" : "var(--color-warning)",
      background: isLive ? "var(--color-gain-muted)" : "var(--color-warning-muted)",
    }}>
      {isLive ? "LIVE" : "STATIC"}
    </span>
  );
}

// ─── Section shell ─────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, delay = 0 }: { title: string; icon: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-card"
      style={{ padding: "1.25rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
        {icon}
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

function QuoteRow({ label, sub, price, currency, changePct }: { label: string; sub?: string; price: number; currency: string; changePct: number | null }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.6rem 0", borderBottom: "1px solid var(--color-border-subtle)",
    }}>
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>{label}</div>
        {sub && <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>
          {fmtPrice(price, currency)}
        </div>
        <ChangeBadge value={changePct} />
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ height: 36, background: "var(--color-bg-input)", borderRadius: 6, animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite` }} />
      ))}
    </div>
  );
}

function WidgetError({ message }: { message: string }) {
  return <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", padding: "0.5rem 0" }}>{message}</div>;
}

// ─── Widgets ───────────────────────────────────────────────────────────────

function IndicesWidget() {
  const { data, isLoading, isError } = useIndices();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data || data.length === 0) return <WidgetError message="World indices unavailable right now." />;
  return (
    <div>
      {data.map((q: MarketQuote) => (
        <QuoteRow key={q.symbol} label={q.label} price={q.price} currency={q.currency} changePct={q.changePct} />
      ))}
    </div>
  );
}

function CurrenciesWidget() {
  const { data, isLoading, isError } = useCurrencies();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data || data.length === 0) return <WidgetError message="Currency rates unavailable right now." />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
      {data.map((c: CurrencyQuote) => (
        <div key={c.symbol} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "0.5rem 0.75rem", background: "var(--color-bg-input)", borderRadius: "var(--radius-md)",
        }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>{c.symbol}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>{c.rate.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function CryptoWidget() {
  const { data, isLoading, isError } = useCryptoMarket();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data || data.length === 0) return <WidgetError message="Crypto market data unavailable right now." />;
  return (
    <div>
      {data.slice(0, 6).map((q: MarketQuote) => (
        <QuoteRow key={q.symbol} label={`${q.label} (${q.symbol})`} price={q.price} currency={q.currency} changePct={q.changePct} />
      ))}
    </div>
  );
}

function CommoditiesWidget() {
  const { data, isLoading, isError } = useCommoditiesMarket();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data || data.length === 0) return <WidgetError message="Commodity prices unavailable right now." />;
  return (
    <div>
      {data.map((q: MarketQuote) => (
        <QuoteRow key={q.symbol} label={q.label} price={q.price} currency={q.currency} changePct={q.changePct} />
      ))}
    </div>
  );
}

function MoversWidget() {
  const { data, isLoading, isError } = useMyMovers();
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError message="Sign in to see your portfolio's movers." />;
  if (!data || (data.gainers.length === 0 && data.losers.length === 0)) {
    return <WidgetError message="No priced holdings yet — add stocks to see your top movers here." />;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-gain)", marginBottom: 4 }}>GAINERS</div>
        {data.gainers.length === 0 && <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>None today</div>}
        {data.gainers.map((q: HoldingMoverQuote) => (
          <QuoteRow key={q.holdingId} label={q.symbol} price={q.price} currency={q.currency} changePct={q.changePct} />
        ))}
      </div>
      <div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-loss)", marginBottom: 4 }}>LOSERS</div>
        {data.losers.length === 0 && <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>None today</div>}
        {data.losers.map((q: HoldingMoverQuote) => (
          <QuoteRow key={q.holdingId} label={q.symbol} price={q.price} currency={q.currency} changePct={q.changePct} />
        ))}
      </div>
    </div>
  );
}

function EconomicCalendarWidget() {
  const { data, isLoading, isError } = useEconomicCalendar();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data) return <WidgetError message="Economic calendar unavailable right now." />;
  return (
    <div>
      {!data.allLive && (
        <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
          Some indicators below are static reference values, not live feeds — see the LIVE/STATIC badge on each.
        </div>
      )}
      {data.indicators.map((ind: EconomicIndicator) => (
        <div key={ind.key} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.5rem 0", borderBottom: "1px solid var(--color-border-subtle)",
        }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>{ind.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>{ind.valuePct.toFixed(2)}%</span>
            <LiveBadge isLive={ind.isLive} />
          </div>
        </div>
      ))}

      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 }}>
          IPO CALENDAR
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginBottom: 8 }}>
          Manually curated — not a live sync. No reliable free global IPO-calendar API was available.
        </div>
        {data.ipoListings.length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>No upcoming IPOs listed yet.</div>
        )}
        {data.ipoListings.map((ipo) => (
          <div key={ipo.id} style={{ padding: "0.4rem 0", fontSize: "0.8rem", color: "var(--color-text-primary)" }}>
            {ipo.companyName} <span style={{ color: "var(--color-text-muted)" }}>· {ipo.exchange}</span>
            {ipo.expectedDate && <span style={{ color: "var(--color-text-muted)" }}> · {ipo.expectedDate}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArticleRow({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "block", textDecoration: "none", padding: "0.65rem 0", borderBottom: "1px solid var(--color-border-subtle)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {article.isPersonalized && article.matchedHoldings.map((h) => (
          <span key={h} style={{
            fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px",
            borderRadius: "var(--radius-full)", color: "var(--color-accent)",
            background: "var(--color-accent-muted)",
          }}>
            {h}
          </span>
        ))}
        <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)" }}>
          {new Date(article.publishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "var(--color-text-primary)", fontWeight: 500, lineHeight: 1.4 }}>
        {article.title}
      </div>
    </a>
  );
}

function PersonalizedNewsWidget() {
  const { data, isLoading, isError } = usePersonalizedNews();
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError message="Sign in to see news for your holdings." />;
  const personalized = (data ?? []).filter((a) => a.isPersonalized);
  if (personalized.length === 0) {
    return <WidgetError message="No news mentioning your current holdings right now." />;
  }
  return <div>{personalized.slice(0, 6).map((a) => <ArticleRow key={a.url} article={a} />)}</div>;
}

function GeneralNewsWidget() {
  const { data, isLoading, isError } = useGeneralNews();
  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data || data.length === 0) {
    return <WidgetError message="No news provider is configured (NEWSAPI_KEY/GNEWS_API_KEY/FINNHUB_KEY) — general market news is unavailable." />;
  }
  return <div>{data.slice(0, 10).map((a) => <ArticleRow key={a.url} article={a} />)}</div>;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            Markets
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            World indices, currencies, crypto, commodities, your movers, and news
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "var(--color-gain)",
            boxShadow: "0 0 6px var(--color-gain)", animation: "pulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Live</span>
        </div>
      </motion.div>

      {/* News — personalized first, above general market news */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <SectionCard title="News relevant to your portfolio" icon={<Newspaper size={16} color="var(--color-accent)" />} delay={0.05}>
          <PersonalizedNewsWidget />
        </SectionCard>
        <SectionCard title="General market news" icon={<Newspaper size={16} color="var(--color-text-secondary)" />} delay={0.1}>
          <GeneralNewsWidget />
        </SectionCard>
      </div>

      {/* Your movers */}
      <SectionCard title="Your top movers" icon={<TrendingUp size={16} color="var(--color-accent)" />} delay={0.12}>
        <MoversWidget />
      </SectionCard>

      {/* Market data widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
        <SectionCard title="World Indices" icon={<Globe2 size={16} color="var(--color-accent)" />} delay={0.15}>
          <IndicesWidget />
        </SectionCard>
        <SectionCard title="Currencies (vs USD)" icon={<RefreshCw size={16} color="var(--color-accent)" />} delay={0.2}>
          <CurrenciesWidget />
        </SectionCard>
        <SectionCard title="Crypto" icon={<TrendingUp size={16} color="var(--color-accent)" />} delay={0.25}>
          <CryptoWidget />
        </SectionCard>
        <SectionCard title="Commodities" icon={<TrendingDown size={16} color="var(--color-accent)" />} delay={0.3}>
          <CommoditiesWidget />
        </SectionCard>
      </div>

      {/* Economic calendar */}
      <SectionCard title="Economic Calendar" icon={<Calendar size={16} color="var(--color-accent)" />} delay={0.35}>
        <EconomicCalendarWidget />
      </SectionCard>
    </div>
  );
}
