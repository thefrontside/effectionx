import "./shoelace.ts";
import "../app/global.css";

import { renderer } from "@b9g/crank/dom";
import { App } from "../app/app.tsx";
renderer.render(<App />, document.body);
