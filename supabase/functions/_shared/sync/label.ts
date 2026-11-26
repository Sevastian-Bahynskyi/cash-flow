// Labels new bank rows: deterministic ladder first, AI (Groq) only for what it left open.
import { aiLabel } from "../classify/ai.ts";
import { loadContext } from "../classify/context.ts";
import type { Labeler } from "./run.ts";

export const classifyLabeler: Labeler = async (db, userId, txs) => aiLabel(await loadContext(db, userId), txs);
