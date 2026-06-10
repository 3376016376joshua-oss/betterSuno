# Gitplans Automation

Use `gitplans/` to keep high-level synchronization notes in the repository.
These notes explain what a sync is meant to accomplish without recording low-level
code details.

## One-time setup

```bash
pnpm git:hooks
```

This points Git at the repository's `.githooks/` directory. The pre-push hook
guards normal `git push` calls and asks for a `gitplans/*.md` entry when the
commits being pushed do not include one.

## Sync with a plan

```bash
pnpm git:sync-plan -- \
  --title "Vocal guide module" \
  --item "pyin extracts melody / F0" \
  --item "energy/onset extracts vocal rhythm points and phrases" \
  --item "simple syllable slot segmentation" \
  --commit \
  --push
```

Useful flags:

- `--stage-all`: stage all current working-tree changes before committing.
- `--message "<commit message>"`: override the default commit message.
- `--body-file <path>`: use a Markdown body file instead of repeated `--item`.
- `--dry-run`: preview the generated plan.

The script creates a timestamped Markdown file under `gitplans/`, stages it, and
can optionally commit and push the current branch.
