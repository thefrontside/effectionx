import type { Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";
import { router } from "../src/router.ts";
import layoutStyles from "./layout.module.css";
import cardStyles from "./components/card.module.css";
import homeStyles from "./home.module.css";

function FeatureCards({ uploadSlot }: { uploadSlot?: Element }) {
  return (
    <section class={layoutStyles.grid}>
      <sl-card>
        <div class={cardStyles.cardHead} slot="header">
          <sl-icon name="wifi" label="Connect to live process" />
          <div>
            <h3>Connect to Live Process</h3>
            <div class={cardStyles.cardText}>
              Inspect a running Effection process in real-time via WebSocket
              connection
            </div>
          </div>
        </div>

        <div class={layoutStyles.footer} slot="footer">
          <a href="/live">
            <sl-button type="button" variant="default">
              Start Connection
            </sl-button>
          </a>
          <div class={homeStyles.meta}>WebSocket URL required</div>
        </div>
      </sl-card>

      <sl-card>
        <div class={cardStyles.cardHead} slot="header">
          <sl-icon name="cloud-upload" label="Load recording" />
          <div>
            <h3>Load Recording</h3>
            <div class={cardStyles.cardText}>
              Analyze a previously recorded session with time-travel controls
              and playback
            </div>
          </div>
        </div>

        <div class={layoutStyles.footer} slot="footer">
          {uploadSlot}
          <div class={homeStyles.meta}>.json, .effection files</div>
        </div>
      </sl-card>

      <sl-card>
        <div class={cardStyles.cardHead} slot="header">
          <sl-icon name="play-fill" label="Try demo" />
          <div>
            <h3>Try Demo</h3>
            <div class={cardStyles.cardText}>
              Explore the inspector with a sample process—no setup or
              configuration required
            </div>
          </div>
          <sl-badge slot="header" variant="info">
            Recommended
          </sl-badge>
        </div>

        <div class={layoutStyles.footer} slot="footer">
          <a href="/demo">
            <sl-button type="button" variant="primary">
              Launch Demo
            </sl-button>
          </a>
          <div class={layoutStyles.meta}>Perfect for first-time users</div>
        </div>
      </sl-card>
    </section>
  );
}

function RecentSessions() {
  return (
    <section class={homeStyles.recentSection}>
      <div class={homeStyles.recentHeader}>
        <h2>Recent Sessions</h2>
        <div class={homeStyles.clearAction}>
          <sl-icon-button
            name="trash"
            label="Clear history"
            variant="text"
            size="small"
            aria-label="Clear history"
          />
          <span>Clear History</span>
        </div>
      </div>
      <div class={homeStyles.recentList}>
        <div class={homeStyles.sessionCard}>
          <sl-card>
            <div class={homeStyles.sessionRow} slot="header">
              <div class={homeStyles.sessionIcon}>
                <sl-icon name="wifi" label="Live" />
              </div>
              <div class={homeStyles.sessionInfo}>
                <div class={homeStyles.sessionTitle}>
                  ws://localhost:8080/inspector{" "}
                  <sl-badge size="small" variant="success">
                    Live
                  </sl-badge>
                </div>
                <div class={homeStyles.sessionMeta}>
                  Last accessed 2 hours ago
                </div>
              </div>
            </div>
          </sl-card>
        </div>

        <div class={homeStyles.sessionCard}>
          <sl-card>
            <div class={homeStyles.sessionRow} slot="header">
              <div class={homeStyles.sessionIcon}>
                <sl-icon name="cloud-upload" label="Recording" />
              </div>
              <div class={homeStyles.sessionInfo}>
                <div class={homeStyles.sessionTitle}>
                  api-server-session-2025-01-15.json{" "}
                  <sl-badge size="small">Recording</sl-badge>
                </div>
                <div class={homeStyles.sessionMeta}>
                  Last accessed yesterday
                </div>
              </div>
              <div class={homeStyles.sessionAction}>
                <sl-button type="button" variant="default">
                  Open
                </sl-button>
              </div>
            </div>
          </sl-card>
        </div>

        <div class={homeStyles.sessionCard}>
          <sl-card>
            <div class={homeStyles.sessionRow} slot="header">
              <div class={homeStyles.sessionIcon}>
                <sl-icon name="wifi" label="Live" />
              </div>
              <div class={homeStyles.sessionInfo}>
                <div class={homeStyles.sessionTitle}>
                  ws://staging.example.com:3000{" "}
                  <sl-badge size="small" variant="success">
                    Live
                  </sl-badge>
                </div>
                <div class={homeStyles.sessionMeta}>
                  Last accessed 3 days ago
                </div>
              </div>
            </div>
          </sl-card>
        </div>

        <div class={homeStyles.sessionCard}>
          <sl-card>
            <div class={homeStyles.sessionRow} slot="header">
              <div class={homeStyles.sessionIcon}>
                <sl-icon name="cloud-upload" label="Recording" />
              </div>
              <div class={homeStyles.sessionInfo}>
                <div class={homeStyles.sessionTitle}>
                  worker-pool-debug.effection{" "}
                  <sl-badge size="small">Recording</sl-badge>
                </div>
                <div class={homeStyles.sessionMeta}>
                  Last accessed last week
                </div>
              </div>
            </div>
          </sl-card>
        </div>
      </div>
    </section>
  );
}

export async function* Home(this: Context): AsyncGenerator<Element> {
  function RecordingUpload({ slot }: { slot?: string }) {
    return (
      <div slot={slot} class={homeStyles.recordingUpload}>
        <input
          type="file"
          id="file-input"
          class={homeStyles.hiddenFileInput}
          onChange={handleFileSelect}
          accept=".json,.effection,application/json,text/json"
          aria-label="Upload recording file"
        />
        <sl-button
          type="button"
          variant="primary"
          onclick={() =>
            (document.getElementById("file-input") as HTMLInputElement).click()
          }
        >
          Browse files
        </sl-button>
      </div>
    );
  }
  const handleFileSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      router.navigate({ route: "recording", state: { file } });
    }
  };

  for ({} of this) {
    yield (
      <Layout>
        <div class={homeStyles.homePage}>
          <main class={homeStyles.homeMain}>
            <FeatureCards uploadSlot={<RecordingUpload />} />

            <RecentSessions />
          </main>
        </div>
      </Layout>
    );
  }
}
