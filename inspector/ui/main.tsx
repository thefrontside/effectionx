import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  type NavigateOptions,
  Outlet,
  useNavigate,
  useHref,
} from "react-router";
import { RouterProvider } from "react-router/dom";

import {
  Provider as SpectrumProvider,
  ToastContainer,
} from "@react-spectrum/s2";
import "@react-spectrum/s2/page.css";

import Home from "./paths/Home.tsx";
import Demo from "./paths/demo/Demo.tsx";
import Recording from "./paths/recording/Recording.tsx";
import Live from "./paths/live/Live.tsx";

// Configure the type of the `routerOptions` prop on all React Spectrum components.
declare module "@react-spectrum/s2" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

function Root() {
  let navigate = useNavigate();

  return (
    <SpectrumProvider background="base" router={{ navigate, useHref }}>
      <ToastContainer />
      <Outlet />
    </SpectrumProvider>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      {
        path: "demo/:nodeId?",
        Component: Demo,
      },
      {
        path: "recording/:nodeId?",
        Component: Recording,
      },
      {
        path: "live/:nodeId?",
        Component: Live,
      },
    ],
  },
]);

const root = document.getElementById("root") as HTMLElement;

ReactDOM.createRoot(root).render(<RouterProvider router={router} />);
