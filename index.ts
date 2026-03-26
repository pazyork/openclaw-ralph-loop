import { definePluginEntry, type AnyAgentTool, type OpenClawPluginApi } from "./api.js";
import { createRalphLoopTool } from "./src/ralph-loop-tool.js";

export default definePluginEntry({
  id: "ralph-loop",
  name: "RALPH-LOOP",
  description: "Long-running task execution with round-based context isolation",
  register(api: OpenClawPluginApi) {
    api.registerTool(createRalphLoopTool(api) as unknown as AnyAgentTool, { optional: true });
  },
});
