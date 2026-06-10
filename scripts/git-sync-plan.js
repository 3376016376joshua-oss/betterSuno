#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const gitplansDir = path.join(projectRoot, 'gitplans');

function printUsage() {
  console.log(`
Usage:
  node scripts/git-sync-plan.js --title <title> --item <summary> [--item <summary> ...] [options]

Creates a high-level sync plan under gitplans/, stages it, and can optionally
commit and push the current branch.

Options:
  --title <title>          Plan title.
  --item <summary>         High-level plan item. May be repeated.
  --body-file <path>       Markdown body file to use instead of --item entries.
  --slug <slug>            Filename suffix. Defaults to a slug from --title.
  --message <message>      Commit message. Defaults to "docs: add git sync plan".
  --stage-all              Stage all working-tree changes before committing.
  --commit                 Create a git commit after staging the plan.
  --push                   Push after commit. Implies --commit.
  --remote <name>          Remote for push. Defaults to origin.
  --branch <name>          Branch for push. Defaults to current branch.
  --dry-run                Print the plan path and content without writing.
  --help                   Show this help.

Examples:
  pnpm git:sync-plan -- --title "Vocal guide module" \\
    --item "pyin extracts melody / F0" \\
    --item "energy/onset extracts phrases" \\
    --commit --push
`);
}

function parseArgs(argv) {
  const args = {
    title: null,
    items: [],
    bodyFile: null,
    slug: null,
    message: 'docs: add git sync plan',
    stageAll: false,
    commit: false,
    push: false,
    remote: 'origin',
    branch: null,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (!argv[index]) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--title') {
      args.title = next();
    } else if (arg === '--item') {
      args.items.push(next());
    } else if (arg === '--body-file') {
      args.bodyFile = next();
    } else if (arg === '--slug') {
      args.slug = next();
    } else if (arg === '--message' || arg === '-m') {
      args.message = next();
    } else if (arg === '--stage-all') {
      args.stageAll = true;
    } else if (arg === '--commit') {
      args.commit = true;
    } else if (arg === '--push') {
      args.push = true;
      args.commit = true;
    } else if (arg === '--remote') {
      args.remote = next();
    } else if (arg === '--branch') {
      args.branch = next();
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.${detail}`);
  }

  return result.stdout ? result.stdout.trim() : '';
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'git-sync-plan';
}

function timestampForFilename(now = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join(''),
  ].join('-');
}

function readBodyFile(bodyFile) {
  const bodyPath = path.resolve(projectRoot, bodyFile);
  if (!fs.existsSync(bodyPath)) {
    throw new Error(`Body file not found: ${bodyPath}`);
  }
  return fs.readFileSync(bodyPath, 'utf8').trim();
}

function buildPlanContent(args) {
  if (!args.title) {
    throw new Error('Missing --title.');
  }

  const body = args.bodyFile
    ? readBodyFile(args.bodyFile)
    : args.items.map((item, index) => `${index + 1}. ${item}`).join('\n');

  if (!body.trim()) {
    throw new Error('Provide at least one --item or pass --body-file.');
  }

  return `# ${args.title}

## Sync Summary

${body.trim()}
`;
}

function currentBranch() {
  return run('git', ['branch', '--show-current'], { capture: true });
}

function ensureGitRepository() {
  run('git', ['rev-parse', '--show-toplevel'], { capture: true });
}

function writePlan(args, content) {
  const fileSlug = slugify(args.slug || args.title);
  const filename = `${timestampForFilename()}-${fileSlug}.md`;
  const outputPath = path.join(gitplansDir, filename);

  if (args.dryRun) {
    console.log(outputPath);
    console.log(content);
    return outputPath;
  }

  fs.mkdirSync(gitplansDir, { recursive: true });
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

function gitHasStagedChanges() {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  return result.status === 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  ensureGitRepository();
  const content = buildPlanContent(args);
  const planPath = writePlan(args, content);

  if (args.dryRun) {
    return;
  }

  const relativePlanPath = path.relative(projectRoot, planPath);

  if (args.stageAll) {
    run('git', ['add', '-A']);
  } else {
    run('git', ['add', relativePlanPath]);
  }

  console.log(`Created and staged ${relativePlanPath}`);

  if (args.commit) {
    if (!gitHasStagedChanges()) {
      throw new Error('No staged changes to commit.');
    }
    run('git', ['commit', '-m', args.message]);
  }

  if (args.push) {
    const branch = args.branch || currentBranch();
    if (!branch) {
      throw new Error('Could not determine current branch. Pass --branch.');
    }
    run('git', ['push', args.remote, branch]);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
