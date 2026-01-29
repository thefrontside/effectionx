import type React from "react";
import { useRef } from "react";

type HomeProps = {
  onStart?: () => void;
  onLoadFile?: (file: File) => void;
  onLaunchDemo?: () => void;
};

const styles: { [k: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "#0f1113",
    color: "white",
    fontFamily:
      "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    padding: "48px 56px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 48,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "#0b0c0d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
    fontWeight: 700,
  },
  titleWrap: {
    textAlign: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 36,
    fontWeight: 600,
    margin: 0,
    color: "#ffffff",
  },
  subtitle: {
    marginTop: 8,
    color: "#9aa0a6",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 20,
    marginTop: 24,
  },
  card: {
    background: "#0b0c0d",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset",
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    border: "1px solid rgba(255,255,255,0.03)",
  },
  cardHead: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 9,
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
  },
  cardText: {
    marginTop: 10,
    color: "#9aa0a6",
    fontSize: 13,
    lineHeight: "1.4",
  },
  footer: {
    marginTop: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  btn: {
    padding: "12px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnPrimary: {
    background: "#ffffff",
    color: "#0b0c0d",
  },
  btnSecondary: {
    background: "#141517",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.03)",
  },
  meta: {
    color: "#8a8f95",
    fontSize: 12,
  },
  badge: {
    marginLeft: "auto",
    fontSize: 12,
    background: "#222426",
    color: "#cdd6da",
    padding: "6px 10px",
    borderRadius: 999,
  },
  recentSection: {
    marginTop: 48,
  },
  recentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  recentList: {
    display: "grid",
    gap: 12,
  },
  sessionCard: {
    background: "#0b0c0d",
    borderRadius: 12,
    padding: 14,
    boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset",
    border: "1px solid rgba(255,255,255,0.03)",
    display: "flex",
    alignItems: "center",
  },
  sessionInfo: {
    marginLeft: 8,
  },
  sessionMeta: {
    marginTop: 6,
    color: "#9aa0a6",
    fontSize: 13,
  },
  sessionBadge: {
    marginLeft: 8,
    fontSize: 11,
    background: "#333",
    color: "#cdd6da",
    padding: "4px 8px",
    borderRadius: 999,
  },
  clearHistory: {
    background: "transparent",
    border: "none",
    color: "#8a8f95",
    cursor: "pointer",
    fontWeight: 600,
  },
  // simple responsive behavior:
  "@media": {
    // @ts-expect-error
    smallGrid: {
      gridTemplateColumns: "1fr",
    },
  },
};

function WifiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 9.5a16 16 0 0 1 20 0"
        stroke="#cbd5da"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12.5a10 10 0 0 1 14 0"
        stroke="#cbd5da"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 15.5a4 4 0 0 1 8 0"
        stroke="#cbd5da"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="18.2" r="1" fill="#cbd5da" />
    </svg>
  );
}

function LoadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12a9 9 0 1 0-8.94 9"
        stroke="#cbd5da"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3v6h-6"
        stroke="#cbd5da"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 3v18l15-9L5 3z" fill="#cbd5da" />
    </svg>
  );
}

export default function Home({ onStart, onLoadFile, onLaunchDemo }: HomeProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerFile = () => {
    inputRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onLoadFile) onLoadFile(file);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logo}>Ei</div>
          <div style={{ fontWeight: 700 }}>Effection Inspector</div>
        </div>
      </header>

      <main>
        <div style={styles.titleWrap}>
          <h1 style={styles.title}>What would you like to inspect?</h1>
          <div style={styles.subtitle}>
            Choose your inspection method to get started
          </div>
        </div>

        <div style={styles.grid as React.CSSProperties}>
          <div style={styles.card}>
            <div>
              <div style={styles.cardHead}>
                <div style={styles.iconWrap}>
                  <WifiIcon />
                </div>
                <div>
                  <h3 style={styles.cardTitle}>Connect to Live Process</h3>
                  <div style={styles.cardText}>
                    Inspect a running Effection process in real-time via
                    WebSocket connection
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.footer}>
              <button
                style={{ ...styles.btn, ...styles.btnSecondary }}
                onClick={onStart}
                aria-label="Start connection"
              >
                Start Connection
              </button>
              <div style={styles.meta}>WebSocket URL required</div>
            </div>
          </div>

          <div style={styles.card}>
            <div>
              <div style={styles.cardHead}>
                <div style={styles.iconWrap}>
                  <LoadIcon />
                </div>
                <div>
                  <h3 style={styles.cardTitle}>Load Recording</h3>
                  <div style={styles.cardText}>
                    Analyze a previously recorded session with time-travel
                    controls and playback
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.footer}>
              <input
                ref={inputRef}
                type="file"
                accept=".json,.effection"
                onChange={handleFile}
                style={{ display: "none" }}
              />
              <button
                style={{ ...styles.btn, ...styles.btnSecondary }}
                onClick={() => {
                  triggerFile();
                }}
                aria-label="Choose file"
              >
                Choose File
              </button>
              <div style={styles.meta}>.json, .effection files</div>
            </div>
          </div>

          <div style={styles.card}>
            <div>
              <div style={styles.cardHead}>
                <div style={styles.iconWrap}>
                  <PlayIcon />
                </div>
                <div>
                  <h3 style={styles.cardTitle}>Try Demo</h3>
                  <div style={styles.cardText}>
                    Explore the inspector with a sample process—no setup or
                    configuration required
                  </div>
                </div>
                <div style={styles.badge}>Recommended</div>
              </div>
            </div>

            <div style={styles.footer}>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={onLaunchDemo}
                aria-label="Launch demo"
              >
                Launch Demo
              </button>
              <div style={styles.meta}>Perfect for first-time users</div>
            </div>
          </div>
        </div>

        <section style={styles.recentSection}>
          <div style={styles.recentHeader}>
            <h2 style={{ margin: 0, color: "#ffffff" }}>Recent Sessions</h2>
            <button style={styles.clearHistory} aria-label="Clear History">
              🗑 Clear History
            </button>
          </div>

          <div style={styles.recentList}>
            <div style={styles.sessionCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                }}
              >
                <div style={styles.iconWrap}>
                  <WifiIcon />
                </div>
                <div style={styles.sessionInfo}>
                  <div style={{ fontWeight: 700 }}>
                    ws://localhost:8080/inspector{" "}
                    <span style={styles.sessionBadge}>Live</span>
                  </div>
                  <div style={styles.sessionMeta}>
                    Last accessed 2 hours ago
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.sessionCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                }}
              >
                <div style={styles.iconWrap}>
                  <LoadIcon />
                </div>
                <div style={styles.sessionInfo}>
                  <div style={{ fontWeight: 700 }}>
                    api-server-session-2025-01-15.json{" "}
                    <span style={styles.sessionBadge}>Recording</span>
                  </div>
                  <div style={styles.sessionMeta}>Last accessed yesterday</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <button style={{ ...styles.btn, ...styles.btnSecondary }}>
                    Open
                  </button>
                </div>
              </div>
            </div>

            <div style={styles.sessionCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                }}
              >
                <div style={styles.iconWrap}>
                  <WifiIcon />
                </div>
                <div style={styles.sessionInfo}>
                  <div style={{ fontWeight: 700 }}>
                    ws://staging.example.com:3000{" "}
                    <span style={styles.sessionBadge}>Live</span>
                  </div>
                  <div style={styles.sessionMeta}>Last accessed 3 days ago</div>
                </div>
              </div>
            </div>

            <div style={styles.sessionCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                }}
              >
                <div style={styles.iconWrap}>
                  <LoadIcon />
                </div>
                <div style={styles.sessionInfo}>
                  <div style={{ fontWeight: 700 }}>
                    worker-pool-debug.effection{" "}
                    <span style={styles.sessionBadge}>Recording</span>
                  </div>
                  <div style={styles.sessionMeta}>Last accessed last week</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
