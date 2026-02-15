import { Trend } from "k6/metrics";

/**
 * Duration of grouped operations in milliseconds.
 */
export const groupDuration = new Trend("group_duration", true);
