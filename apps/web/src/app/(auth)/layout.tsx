export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      {/* Background gradient blobs */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 50% at 30% 20%, rgba(61,131,255,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 70% 80%, rgba(0,217,126,0.06) 0%, transparent 60%)",
        }}
      />
      <div style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "linear-gradient(135deg, #3D83FF, #00D97E)",
              fontSize: "1.5rem",
              boxShadow: "0 0 32px rgba(61,131,255,0.3)",
              marginBottom: "0.75rem",
            }}
          >
            ₹
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            RicherWealth
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
