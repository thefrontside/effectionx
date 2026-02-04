import type { Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";

export async function* Home(this: Context): AsyncGenerator<Element> {
  function RecordingUpload({ slot }: { slot?: string }) {
    return (
      <div slot={slot} class="recording-upload">
        <input
          type="file"
          id="file-input"
          class="hidden-file-input"
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
      // notify any listeners in the app and navigate
      window.dispatchEvent(
        new CustomEvent("inspector-recording-upload", { detail: { file } }),
      );
      // include the file in history.state as a fallback (structured-cloneable)
      history.pushState({ fileName: file.name, file }, "", "/recording");
      this.refresh();
    }
  };

  for ({} of this) {
    yield (
      <Layout>
        <div class="home-page">
          <main class="home-main">
            <section class="grid">
              <sl-card class="card">
                <div class="card-head" slot="header">
                  <sl-icon
                    name="wifi"
                    label="Connect to live process"
                    class="card-icon"
                  />
                  <div>
                    <h3>Connect to Live Process</h3>
                    <div class="card-text">
                      Inspect a running Effection process in real-time via
                      WebSocket connection
                    </div>
                  </div>
                </div>

                <div class="footer" slot="footer">
                  <a href="/live">
                    <sl-button type="button" variant="default">
                      Start Connection
                    </sl-button>
                  </a>
                  <div class="meta">WebSocket URL required</div>
                </div>
              </sl-card>

              <sl-card class="card">
                <div class="card-head" slot="header">
                  <sl-icon
                    name="cloud-upload"
                    label="Load recording"
                    class="card-icon"
                  />
                  <div>
                    <h3>Load Recording</h3>
                    <div class="card-text">
                      Analyze a previously recorded session with time-travel
                      controls and playback
                    </div>
                  </div>
                </div>

                <div class="footer" slot="footer">
                  <RecordingUpload />
                  <div class="meta">.json, .effection files</div>
                </div>
              </sl-card>

              <sl-card class="card">
                <div class="card-head" slot="header">
                  <sl-icon
                    name="play-fill"
                    label="Try demo"
                    class="card-icon"
                  />
                  <div>
                    <h3>Try Demo</h3>
                    <div class="card-text">
                      Explore the inspector with a sample process—no setup or
                      configuration required
                    </div>
                  </div>
                  <sl-badge slot="header" variant="info">
                    Recommended
                  </sl-badge>
                </div>

                <div class="footer" slot="footer">
                  <a href="/demo">
                    <sl-button type="button" variant="primary">
                      Launch Demo
                    </sl-button>
                  </a>
                  <div class="meta">Perfect for first-time users</div>
                </div>
              </sl-card>
            </section>

            <section class="recent-section">
              <div class="recent-header">
                <h2>Recent Sessions</h2>
                <sl-button
                  class="clear-history"
                  variant="text"
                  size="small"
                  type="button"
                >
                  <sl-icon
                    name="trash"
                    label="Clear history"
                    class="clear-icon"
                  ></sl-icon>
                  Clear History
                </sl-button>
              </div>
              <div class="recent-list">
                <div class="session-card">
                  <div class="session-row">
                    <div class="session-icon">
                      <sl-icon name="wifi" label="Live" class="card-icon" />
                    </div>
                    <div class="session-info">
                      <div class="session-title">
                        ws://localhost:8080/inspector{" "}
                        <sl-badge size="small" variant="success">
                          Live
                        </sl-badge>
                      </div>
                      <div class="session-meta">Last accessed 2 hours ago</div>
                    </div>
                  </div>
                </div>

                <div class="session-card">
                  <div class="session-row">
                    <div class="session-icon">
                      <sl-icon
                        name="cloud-upload"
                        label="Recording"
                        class="card-icon"
                      />
                    </div>
                    <div class="session-info">
                      <div class="session-title">
                        api-server-session-2025-01-15.json{" "}
                        <sl-badge size="small">Recording</sl-badge>
                      </div>
                      <div class="session-meta">Last accessed yesterday</div>
                    </div>
                    <div class="session-action">
                      <sl-button type="button" variant="default">
                        Open
                      </sl-button>
                    </div>
                  </div>
                </div>

                <div class="session-card">
                  <div class="session-row">
                    <div class="session-icon">
                      <sl-icon name="wifi" label="Live" class="card-icon" />
                    </div>
                    <div class="session-info">
                      <div class="session-title">
                        ws://staging.example.com:3000{" "}
                        <sl-badge size="small" variant="success">
                          Live
                        </sl-badge>
                      </div>
                      <div class="session-meta">Last accessed 3 days ago</div>
                    </div>
                  </div>
                </div>

                <div class="session-card">
                  <div class="session-row">
                    <div class="session-icon">
                      <sl-icon
                        name="cloud-upload"
                        label="Recording"
                        class="card-icon"
                      />
                    </div>
                    <div class="session-info">
                      <div class="session-title">
                        worker-pool-debug.effection{" "}
                        <sl-badge size="small">Recording</sl-badge>
                      </div>
                      <div class="session-meta">Last accessed last week</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </Layout>
    );
  }
}
