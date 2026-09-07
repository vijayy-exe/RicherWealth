import type { LucideIcon } from "lucide-react";

type Tone = "accent" | "gain" | "loss" | "warning" | "neutral";

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: "var(--color-accent-muted)", fg: "var(--color-accent)" },
  gain: { bg: "var(--color-gain-muted)", fg: "var(--color-gain)" },
  loss: { bg: "var(--color-loss-muted)", fg: "var(--color-loss)" },
  warning: { bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  neutral: { bg: "var(--color-bg-input)", fg: "var(--color-text-secondary)" },
};

/**
 * A consistent icon container — rounded square, tinted background, a real
 * lucide icon at a fixed stroke weight — used everywhere a page previously
 * dropped a bare emoji into a `fontSize` span. This single sizing/tone
 * system is what makes icons read as a deliberate product decision rather
 * than decoration; every call site should go through this instead of
 * reinventing its own icon-circle styling.
 */
export function IconBadge({
  icon: Icon,
  tone = "accent",
  size = 44,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
}) {
  const { bg, fg } = TONE_STYLES[tone];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size <= 32 ? 8 : 12,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} color={fg} />
    </div>
  );
}
