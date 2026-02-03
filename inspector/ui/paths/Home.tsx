import { useNavigate } from "react-router";
import { RecordingUpload } from "../components/RecordingUpload.tsx";
import {
  Button,
  Badge,
  Card,
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
} from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };

type HomeProps = {
  onStart?: () => void;
  onLoadFile?: (file: File) => void;
  onLaunchDemo?: () => void;
};

const pageStyle = style({
  paddingInline: "16px",
  paddingBlock: "12px",
  marginInline: "auto",
} as const);
const headerStyle = style({
  paddingBlock: "8px",
  display: "flex",
  alignItems: "center",
} as const);
const brandStyle = style({
  display: "flex",
  alignItems: "center",
  gap: "12",
} as const);
const logoStyle = style({
  width: "[40px]",
  height: "[40px]",
  borderRadius: "[6px]",
  backgroundColor: "var(--spectrum-global-color-gray-200)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
} as const);
const strongStyle = style({
  fontWeight: "medium",
  marginLeft: "8",
} as const);
const titleWrapStyle = style({
  marginTop: "16",
  marginBottom: "12",
} as const);
const titleStyle = style({ font: "heading-xl", margin: 0 } as const);
const subtitleStyle = style({
  font: "body",
  color: "var(--spectrum-global-color-gray-600)",
  marginTop: "8",
} as const);
const gridStyle = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "12",
  marginTop: "16",
} as const);
const cardBase = style({
  paddingBlock: "12",
  paddingInline: "12",
  borderRadius: "[6px]",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  minHeight: "[140px]",
} as const);
const cardHeadStyle = style({
  display: "flex",
  gap: "12",
  alignItems: "center",
} as const);
const iconWrapStyle = style({
  width: "[40px]",
  height: "[40px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "[6px]",
  backgroundColor: "var(--spectrum-global-color-gray-100)",
} as const);
const cardTitleStyle = style({ font: "body", margin: 0 } as const);
const cardTextStyle = style({
  font: "body-sm",
  color: "var(--spectrum-global-color-gray-600)",
  marginTop: "8",
} as const);
const footerStyle = style({
  marginTop: "12",
  display: "flex",
  gap: "12",
  alignItems: "center",
  justifyContent: "space-between",
} as const);
const metaStyle = style({
  font: "body-sm",
  color: "var(--spectrum-global-color-gray-600)",
} as const);
const badgeStyle = style({ marginLeft: "auto" } as const);
const clearHistoryStyle = style({ marginLeft: "auto" } as const);
const recentSectionStyle = style({ marginTop: "20" } as const);
const recentHeaderStyle = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
} as const);

function resolveClass(
  c: string | ((props?: Record<string, any>) => string) | undefined,
  props?: Record<string, any>,
) {
  if (!c) return undefined;
  return typeof c === "function" ? c(props) : c;
}

function WifiIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 3v18l15-9L5 3z" fill="#cbd5da" />
    </svg>
  );
}

export default function Home({ onStart, onLoadFile, onLaunchDemo }: HomeProps) {
  const navigate = useNavigate();

  const handleUpload = (file: File) => {
    if (onLoadFile) onLoadFile(file);
    navigate("/recording", { state: { file } });
  };

  return (
    <div className={resolveClass(pageStyle)}>
      <header className={resolveClass(headerStyle)}>
        <div className={resolveClass(brandStyle)}>
          <div className={resolveClass(logoStyle)}>Ei</div>
          <div className={resolveClass(strongStyle)}>Effection Inspector</div>
        </div>
      </header>

      <main>
        <div className={resolveClass(titleWrapStyle)}>
          <h1 className={resolveClass(titleStyle)}>
            What would you like to inspect?
          </h1>
          <div className={resolveClass(subtitleStyle)}>
            Choose your inspection method to get started
          </div>
        </div>

        <div className={resolveClass(gridStyle)}>
          <Card>
            <div className={resolveClass(cardBase)}>
              <div>
                <div className={resolveClass(cardHeadStyle)}>
                  <div className={resolveClass(iconWrapStyle)}>
                    <WifiIcon />
                  </div>
                  <div>
                    <h3 className={resolveClass(cardTitleStyle)}>
                      Connect to Live Process
                    </h3>
                    <div className={resolveClass(cardTextStyle)}>
                      Inspect a running Effection process in real-time via
                      WebSocket connection
                    </div>
                  </div>
                </div>
              </div>

              <div className={resolveClass(footerStyle)}>
                <Button
                  variant="secondary"
                  onPress={() => {
                    if (onStart) onStart();
                    navigate("/live");
                  }}
                  aria-label="Start connection"
                >
                  Start Connection
                </Button>
                <div className={resolveClass(metaStyle)}>
                  WebSocket URL required
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className={resolveClass(cardBase)}>
              <div>
                <div className={resolveClass(cardHeadStyle)}>
                  <div className={resolveClass(iconWrapStyle)}>
                    <LoadIcon />
                  </div>
                  <div>
                    <h3 className={resolveClass(cardTitleStyle)}>
                      Load Recording
                    </h3>
                    <div className={resolveClass(cardTextStyle)}>
                      Analyze a previously recorded session with time-travel
                      controls and playback
                    </div>
                  </div>
                </div>
              </div>

              <div className={resolveClass(footerStyle)}>
                <RecordingUpload setFile={(file) => handleUpload(file)} />
                <div className={resolveClass(metaStyle)}>
                  .json, .effection files
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className={resolveClass(cardBase)}>
              <div>
                <div className={resolveClass(cardHeadStyle)}>
                  <div className={resolveClass(iconWrapStyle)}>
                    <PlayIcon />
                  </div>
                  <div>
                    <h3 className={resolveClass(cardTitleStyle)}>Try Demo</h3>
                    <div className={resolveClass(cardTextStyle)}>
                      Explore the inspector with a sample process—no setup or
                      configuration required
                    </div>
                  </div>
                  <div className={resolveClass(badgeStyle)}>
                    <span>
                      <Badge>Recommended</Badge>
                    </span>
                  </div>
                </div>
              </div>

              <div className={resolveClass(footerStyle)}>
                <Button
                  variant="primary"
                  onPress={() => {
                    if (onLaunchDemo) onLaunchDemo();
                    navigate("/demo");
                  }}
                  aria-label="Launch demo"
                >
                  Launch Demo
                </Button>
                <div className={resolveClass(metaStyle)}>
                  Perfect for first-time users
                </div>
              </div>
            </div>
          </Card>
        </div>

        <section className={resolveClass(recentSectionStyle)}>
          <div className={resolveClass(recentHeaderStyle)}>
            <h2
              className={resolveClass(
                style({
                  margin: 0,
                  color: "var(--spectrum-global-color-gray-950)",
                }),
              )}
            >
              Recent Sessions
            </h2>
            <div className={resolveClass(clearHistoryStyle)}>
              <Button variant="secondary" aria-label="Clear History">
                🗑 Clear History
              </Button>
            </div>
          </div>

          <TableView aria-label="Recent sessions">
            <TableHeader>
              <Column id="name" isRowHeader>
                Name
              </Column>
              <Column id="type">Type</Column>
              <Column id="last">Last accessed</Column>
              <Column id="actions">Actions</Column>
            </TableHeader>

            <TableBody
              items={[
                {
                  id: "live-local",
                  name: "ws://localhost:8080/inspector",
                  type: "Live",
                  last: "2 hours ago",
                  kind: "live",
                },
                {
                  id: "recording-1",
                  name: "api-server-session-2025-01-15.json",
                  type: "Recording",
                  last: "yesterday",
                  kind: "recording",
                },
                {
                  id: "live-staging",
                  name: "ws://staging.example.com:3000",
                  type: "Live",
                  last: "3 days ago",
                  kind: "live",
                },
                {
                  id: "recording-2",
                  name: "worker-pool-debug.effection",
                  type: "Recording",
                  last: "last week",
                  kind: "recording",
                },
              ]}
            >
              {(item) => (
                <Row id={item.id}>
                  <Cell>{item.name}</Cell>
                  <Cell>
                    {item.kind === "live" ? (
                      <Badge>Live</Badge>
                    ) : (
                      <Badge>Recording</Badge>
                    )}
                  </Cell>
                  <Cell>{item.last}</Cell>
                  <Cell>
                    <Button
                      variant="secondary"
                      onPress={() => {
                        /* TODO: hook into session open */
                      }}
                    >
                      Open
                    </Button>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </section>
      </main>
    </div>
  );
}
