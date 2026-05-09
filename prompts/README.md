# Prompts

Every code change should be accompanied by a `prompts/<task-id>.md` file capturing the **originating prompt** — the user instruction or specialist brief that generated the change.

## Format

```markdown
# Prompt — <task-id>

- Task: <Anytype Task URL or ID>
- Author: <user | skill-name>
- Date: <YYYY-MM-DD>

## Prompt

<verbatim text given to the agent>

## Notes

<optional: clarifications, constraints, decisions made mid-implementation>
```

This is an audit trail, not documentation. Keep prompts verbatim.
