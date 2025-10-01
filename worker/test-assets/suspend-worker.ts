import { suspend } from "effection";
import { workerMain } from "../worker-main.ts";

await workerMain(suspend);
