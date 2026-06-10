#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const audioExtensions = new Set(['.wav', '.flac', '.mp3', '.m4a', '.ogg']);

function printUsage() {
  console.log(`
Usage:
  node scripts/converters/seed-vc-v1-wrapper.js --seed-vc-dir <dir> --target <reference.wav> --input <vocals.wav> --output <converted.wav> [options]

Runs Seed-VC V1 as a BetterSuno converter command. BetterSuno passes the separated
vocal stem as --input and expects this wrapper to write the final converted file
to --output.

Required:
  --seed-vc-dir <dir>        Local Seed-VC repository directory.
  --target <file>            Target voice reference audio. Usually passed as {voiceModel}.
  --input <file>             Source vocal stem. Usually passed as {input}.
  --output <file>            Final converted vocal path. Usually passed as {output}.

Common options:
  --python <bin>             Python executable. Defaults to python.
  --output-dir <dir>         Temporary Seed-VC output dir. Defaults to an OS temp dir.
  --diffusion-steps <n>      Defaults to 30.
  --f0-condition <bool>      Defaults to True for singing voice conversion.
  --checkpoint <path>        Optional Seed-VC checkpoint path.
  --config <path>            Optional Seed-VC config path.
  --hf-endpoint <url>        Optional Hugging Face endpoint mirror.
  --extra-arg <arg>          Extra argument passed through to Seed-VC. May be repeated.
  --help                     Show this help.

Example converterCommandJson:
  ["node","scripts/converters/seed-vc-v1-wrapper.js","--seed-vc-dir","/opt/seed-vc","--target","{voiceModel}","--input","{input}","--output","{output}"]
`);
}

function parseArgs(argv) {
  const args = {
    seedVcDir: null,
    python: 'python',
    input: null,
    target: null,
    output: null,
    outputDir: null,
    diffusionSteps: '30',
    f0Condition: 'True',
    checkpoint: null,
    config: null,
    hfEndpoint: null,
    extraArgs: [],
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

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--seed-vc-dir') {
      args.seedVcDir = next();
    } else if (arg === '--python') {
      args.python = next();
    } else if (arg === '--input') {
      args.input = next();
    } else if (arg === '--target') {
      args.target = next();
    } else if (arg === '--output') {
      args.output = next();
    } else if (arg === '--output-dir') {
      args.outputDir = next();
    } else if (arg === '--diffusion-steps') {
      args.diffusionSteps = next();
    } else if (arg === '--f0-condition') {
      args.f0Condition = next();
    } else if (arg === '--checkpoint') {
      args.checkpoint = next();
    } else if (arg === '--config') {
      args.config = next();
    } else if (arg === '--hf-endpoint') {
      args.hfEndpoint = next();
    } else if (arg === '--extra-arg') {
      args.extraArgs.push(next());
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function resolvePath(value, cwd = process.cwd()) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(cwd, value);
}

function ensureFile(filePath, label) {
  const resolved = resolvePath(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }

  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`${label} must be a file: ${resolved}`);
  }

  return resolved;
}

function ensureDirectory(dirPath, label) {
  const resolved = resolvePath(dirPath);
  fs.mkdirSync(resolved, { recursive: true });

  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} must be a directory: ${resolved}`);
  }

  return resolved;
}

function requireOption(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function runCommand(command, commandArgs, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${options.label || command} failed with exit code ${code}`));
    });
  });
}

function collectAudioFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAudioFiles(entryPath));
    } else if (entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(entryPath);
      if (stat.size > 0) {
        files.push({
          path: entryPath,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      }
    }
  }

  return files;
}

function newestAudioFile(dirPath) {
  return collectAudioFiles(dirPath).sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)[0]?.path || null;
}

function buildSeedVcArgs(options) {
  const seedVcArgs = [
    'inference.py',
    '--source',
    options.input,
    '--target',
    options.target,
    '--output',
    options.outputDir,
    '--diffusion-steps',
    options.diffusionSteps,
    '--f0-condition',
    options.f0Condition,
  ];

  if (options.checkpoint) {
    seedVcArgs.push('--checkpoint', options.checkpoint);
  }

  if (options.config) {
    seedVcArgs.push('--config', options.config);
  }

  seedVcArgs.push(...options.extraArgs);
  return seedVcArgs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const seedVcDir = ensureDirectory(requireOption(args.seedVcDir, '--seed-vc-dir'), 'Seed-VC directory');
  const inferenceScript = ensureFile(path.join(seedVcDir, 'inference.py'), 'Seed-VC inference.py');
  const input = ensureFile(requireOption(args.input, '--input'), 'Input vocals');
  const target = ensureFile(requireOption(args.target, '--target'), 'Target reference audio');
  const output = resolvePath(requireOption(args.output, '--output'));
  const outputDir = ensureDirectory(
    args.outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'better-suno-seed-vc-')),
    'Seed-VC output directory'
  );

  const before = new Set(collectAudioFiles(outputDir).map((file) => file.path));
  await runCommand(args.python, buildSeedVcArgs({
    input,
    target,
    outputDir,
    diffusionSteps: args.diffusionSteps,
    f0Condition: args.f0Condition,
    checkpoint: args.checkpoint ? resolvePath(args.checkpoint) : null,
    config: args.config ? resolvePath(args.config) : null,
    extraArgs: args.extraArgs,
  }), {
    cwd: seedVcDir,
    label: 'Seed-VC inference',
    env: {
      PYTHONUNBUFFERED: '1',
      ...(args.hfEndpoint ? { HF_ENDPOINT: args.hfEndpoint } : {}),
    },
  });

  const generated =
    collectAudioFiles(outputDir)
      .filter((file) => !before.has(file.path))
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)[0]?.path || newestAudioFile(outputDir);

  if (!generated) {
    throw new Error(`Seed-VC completed but no audio file was found in ${outputDir}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(generated, output);

  const outputStat = fs.statSync(output);
  if (outputStat.size <= 0) {
    throw new Error(`Seed-VC output is empty: ${output}`);
  }

  console.log(`Seed-VC wrapper wrote ${output} from ${generated}`);
  void inferenceScript;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSeedVcArgs,
  collectAudioFiles,
  newestAudioFile,
  parseArgs,
};
