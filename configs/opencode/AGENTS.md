# AGENTS

## Better Code Soul

This project has Better Code Soul installed. It provides:

- **Token tracking**: Every tool call is tracked for cost analysis
- **Parallel subagent orchestration**: Large tasks are decomposed and run in parallel across multiple models
- **Graphify integration**: Knowledge graph for the codebase
- **Context Mode**: Tool output summarization for token savings

### Commands

| Command | Description |
|---------|-------------|
| `/bcs-status` | General status — tokens, cost, active tools |
| `/bcs-tokens [period]` | Token/cost report (session, today, week, month) |
| `/bcs-models` | Available models and auth status |
| `/bcs-agent "task"` | Parallel subagent orchestration |
| `/bcs-graphify` | Graphify memory system management |
| `/bcs-context-mode` | Context Mode management |
| `/bcs-optimize` | Optimization suggestions |

### Parallel Subagent Strategy

When you use `/bcs-agent`, the system:
1. **Decomposes** the task into parallel subtasks (rule-based, no cost)
2. **Plans** with a think-tier model (1 agent)
3. **Codes** with code-tier models (N agents in parallel)
4. **Reviews** with review-tier models (N agents in parallel)
5. **Merges** results and checks for conflicts

### Graphify

If graphify is active, the project knowledge graph is available at `graphify-out/graph.json`.
Use `/bcs-graphify build` to create or update the graph.

### Context Mode

If Context Mode is active, tool outputs are summarized before entering context.
This saves approximately 98% of tool output tokens.
