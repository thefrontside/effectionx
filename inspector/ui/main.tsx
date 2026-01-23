import ReactDOM from "react-dom/client";
import { createStore, parallel } from "starfx";
import { Provider as StarfxProvider } from "starfx/react";
import { schema, initialState } from "./store/schema";
import { thunks } from "./store/thunks/foundation";
import { Provider as SpectrumProvider } from "@react-spectrum/s2";
import App from "./App";

import "@react-spectrum/s2/page.css";

const store = createStore({ initialState });
(window as any).fx = store;

store.initialize(function* () {
  const group = yield* parallel([thunks.register]);
  yield* group;
});

const root = document.getElementById("root") as HTMLElement;
ReactDOM.createRoot(root).render(
  <StarfxProvider schema={schema} store={store}>
    <SpectrumProvider background="base">
      <App />
    </SpectrumProvider>
  </StarfxProvider>,
);
