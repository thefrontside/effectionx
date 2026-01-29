import ReactDOM from "react-dom/client";
import {
  Provider as SpectrumProvider,
  ToastContainer,
} from "@react-spectrum/s2";
import App from "./App.tsx";

import "@react-spectrum/s2/page.css";

const root = document.getElementById("root") as HTMLElement;
ReactDOM.createRoot(root).render(
  <SpectrumProvider background="base">
    <ToastContainer />
    <App />
  </SpectrumProvider>,
);
