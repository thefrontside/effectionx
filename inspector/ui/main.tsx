import ReactDOM from "react-dom/client";
import { createStore } from "starfx";
import { Provider as StarfxProvider } from "starfx/react";
import { schema, initialState } from "./store/schema";
import { thunk } from "./store/foundation";
import { Provider as SpectrumProvider } from "@react-spectrum/s2";
import App from "./App";

import "@react-spectrum/s2/page.css";

const store = createStore({ initialState });
store.initialize(thunk.register);

function Root() {
  return (
    <StarfxProvider schema={schema} store={store}>
      <SpectrumProvider background="base">
        <App />
      </SpectrumProvider>
    </StarfxProvider>
  );
}

const root = document.getElementById("root") as HTMLElement;
ReactDOM.createRoot(root).render(<Root />);
