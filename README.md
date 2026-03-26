# RALPH-LOOP

Long-running task execution with round-based context isolation and constitutional constraints.

## Features

- **Round-based execution** - Clean context per round prevents context pollution
- **Constitutional governance** - Immutable RULE.md that agents cannot override
- **Git traceability** - Automatic commits after each round
- **Progress persistence** - Real-time progress tracking
- **Fault tolerance** - Automatic retries on round failures

## Usage

```bash
# Start a new loop
ralph-loop start "Research quantum computing" --minRounds 3 --maxRounds 10

# Check progress
ralph-loop progress --taskId <task-id>

# Stop a running loop
ralph-loop stop --taskId <task-id>
```

## Configuration

```json
{
  "defaultMinRounds": 3,
  "defaultMaxRounds": 10,
  "pushInterval": 1,
  "tickIntervalMs": 5000
}
```

## License

MIT
