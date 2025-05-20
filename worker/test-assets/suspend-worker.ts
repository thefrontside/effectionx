import { suspend } from "effection";
import { workerMain } from "../worker.ts";

await workerMain(suspend);
