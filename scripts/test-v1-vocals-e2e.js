#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const defaultApiUrl = process.env.BETTER_SUNO_API_URL || 'http://localhost:4000';
const defaultConverterCommandJson = process.env.VOICE_CONVERTER_COMMAND_JSON || null;

function printUsage() {
  console.log(`
Usage:
  node scripts/test-v1-vocals-e2e.js <audio-file> [options]

Runs a no-touch API E2E test for the V1 vocal remix pipeline:
  1. Ensure the API is reachable, starting it when needed
  2. Submit POST /v1/remix/vocals/jobs
  3. Poll the job until completed or failed
  4. Fetch every returned artifact URL and verify it is non-empty

Required for a real converter run:
  <audio-file>                         Source audio file
  --converter-mode <svc|rvc>            Use backend SVC/RVC preset from env/profile
  or --converter-command-json <json>    Use an explicit JSON array command template

Common options:
  --converter-mode <mode>               custom, svc, or rvc
  --voice-profile <id>                  Voice profile id
  --voice-model <path>                  Voice model/adapter path
  --voice-index <path>                  Optional feature index path
  --out-dir <dir>                       Output directory
  --converted-output <path>             Converted vocal output path
  --guide-lyrics <text>                 Replacement lyrics to align into vocal guide slots
  --guide-lyrics-file <path>            UTF-8 replacement lyrics file
  --vocal-guide-output <path>           Guide JSON path
  --melody-midi-output <path>           Melody MIDI path
  --alignment-json-output <path>        Alignment JSON path
  --alignment-textgrid-output <path>    TextGrid path
  --syllable-map-output <path>          Syllable map path
  --vocal-guide-language <lang>         Lyric language hint. Defaults to auto
  --vocal-guide-max-mismatch-ratio <n>  Accepted syllable/slot mismatch ratio
  --require-vocal-guide-match           Fail job when guide syllable fit is not acceptable
  --generate-vocal-guide                Generate melody/rhythm guide even without lyrics
  --extract-rhythm                      Generate rhythm.json with beat grid, phrases, and vocal onsets
  --rhythm-output <path>                Rhythm JSON path
  --rhythm-beat-source <source>         vocals, instrumental, mix, or auto. Defaults to vocals
  --rhythm-sample-rate <hz>             Analysis sample rate. Defaults to worker default
  --rhythm-hop-length <samples>         Analysis hop length. Defaults to worker default
  --converter-cwd <dir>                 Working directory for converter command
  --separator-model <filename>          audio-separator model filename
  --separator-format <format>           Separator output format. Defaults to API/script default
  --separator-chunk-duration <sec>      Process long files in chunks
  --separator-image <docker-image>      audio-separator Docker image
  --api-url <url>                       API base URL. Defaults to ${defaultApiUrl}
  --timeout-ms <ms>                     Overall job timeout. Defaults to 900000
  --poll-ms <ms>                        Poll interval. Defaults to 1500
  --no-start-api                        Require an already running API
  --mock-converter                      Copy separated vocals to converted-vocals for pipeline smoke tests
  --help                               Show this help

Example:
  node scripts/test-v1-vocals-e2e.js ./source.mp3 \\
    --voice-profile demo \\
    --voice-model ./storage/voice-profiles/demo/adapter.safetensors \\
    --converter-command-json '["python","/path/to/svc/infer.py","--input","{input}","--output","{output}","--model","{voiceModel}"]'
`);
}

function parseArgs(argv) {
  const args = {
    source: null,
    apiUrl: defaultApiUrl,
    startApi: true,
    timeoutMs: 900000,
    pollMs: 1500,
    converterMode: null,
    voiceProfileId: null,
    voiceModelPath: null,
    voiceIndexPath: null,
    outputDir: null,
    convertedVocalsPath: null,
    guideLyrics: null,
    guideLyricsPath: null,
    vocalGuidePath: null,
    melodyMidiPath: null,
    alignmentJsonPath: null,
    alignmentTextGridPath: null,
    syllableMapPath: null,
    vocalGuideLanguage: null,
    vocalGuideMaxMismatchRatio: null,
    requireVocalGuideMatch: false,
    generateVocalGuide: false,
    extractRhythm: false,
    rhythmPath: null,
    rhythmBeatSource: null,
    rhythmSampleRate: null,
    rhythmHopLength: null,
    converterCommandJson: defaultConverterCommandJson,
    converterCwd: null,
    separatorModel: null,
    separatorOutputFormat: null,
    separatorChunkDuration: null,
    separatorImage: null,
    mockConverter: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (!argv[i]) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[i];
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--api-url') {
      args.apiUrl = next();
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(next());
    } else if (arg === '--poll-ms') {
      args.pollMs = Number(next());
    } else if (arg === '--no-start-api') {
      args.startApi = false;
    } else if (arg === '--mock-converter') {
      args.mockConverter = true;
    } else if (arg === '--converter-mode') {
      args.converterMode = next();
    } else if (arg === '--voice-profile') {
      args.voiceProfileId = next();
    } else if (arg === '--voice-model') {
      args.voiceModelPath = next();
    } else if (arg === '--voice-index') {
      args.voiceIndexPath = next();
    } else if (arg === '--out-dir') {
      args.outputDir = next();
    } else if (arg === '--converted-output') {
      args.convertedVocalsPath = next();
    } else if (arg === '--guide-lyrics') {
      args.guideLyrics = next();
    } else if (arg === '--guide-lyrics-file') {
      args.guideLyricsPath = next();
    } else if (arg === '--vocal-guide-output') {
      args.vocalGuidePath = next();
    } else if (arg === '--melody-midi-output') {
      args.melodyMidiPath = next();
    } else if (arg === '--alignment-json-output') {
      args.alignmentJsonPath = next();
    } else if (arg === '--alignment-textgrid-output') {
      args.alignmentTextGridPath = next();
    } else if (arg === '--syllable-map-output') {
      args.syllableMapPath = next();
    } else if (arg === '--vocal-guide-language') {
      args.vocalGuideLanguage = next();
    } else if (arg === '--vocal-guide-max-mismatch-ratio') {
      args.vocalGuideMaxMismatchRatio = Number(next());
    } else if (arg === '--require-vocal-guide-match') {
      args.requireVocalGuideMatch = true;
    } else if (arg === '--generate-vocal-guide') {
      args.generateVocalGuide = true;
    } else if (arg === '--extract-rhythm') {
      args.extractRhythm = true;
    } else if (arg === '--rhythm-output') {
      args.rhythmPath = next();
    } else if (arg === '--rhythm-beat-source') {
      args.rhythmBeatSource = next();
    } else if (arg === '--rhythm-sample-rate') {
      args.rhythmSampleRate = Number(next());
    } else if (arg === '--rhythm-hop-length') {
      args.rhythmHopLength = Number(next());
    } else if (arg === '--converter-command-json') {
      args.converterCommandJson = next();
    } else if (arg === '--converter-cwd') {
      args.converterCwd = next();
    } else if (arg === '--separator-model') {
      args.separatorModel = next();
    } else if (arg === '--separator-format') {
      args.separatorOutputFormat = next();
    } else if (arg === '--separator-chunk-duration') {
      args.separatorChunkDuration = Number(next());
    } else if (arg === '--separator-image') {
      args.separatorImage = next();
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.source) {
      args.source = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }

  return args;
}

function resolveProjectPath(value) {
  if (!value) {
    return undefined;
  }

  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

function ensureFile(filePath, label) {
  const resolved = resolveProjectPath(filePath);
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved || filePath}`);
  }

  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`${label} must be a file: ${resolved}`);
  }

  return resolved;
}

function validateCommandJson(commandJson) {
  if (!commandJson) {
    throw new Error('Missing converter command. Pass --converter-command-json or set VOICE_CONVERTER_COMMAND_JSON.');
  }

  let parsed;
  try {
    parsed = JSON.parse(commandJson);
  } catch (error) {
    throw new Error(`converter command must be a JSON array: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string')) {
    throw new Error('converter command must be a non-empty JSON string array.');
  }
}

function validateConverterMode(mode) {
  if (!mode) {
    return;
  }

  if (!['custom', 'svc', 'rvc'].includes(mode)) {
    throw new Error('--converter-mode must be custom, svc, or rvc.');
  }
}

function mockConverterCommandJson() {
  return JSON.stringify([
    'node',
    '-e',
    "const fs=require('fs'); const [input,output]=process.argv.slice(1); fs.copyFileSync(input,output);",
    '{input}',
    '{output}',
  ]);
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await readJsonResponse(response);

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : `HTTP ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }

  return body;
}

async function isApiReady(apiUrl) {
  try {
    const response = await fetch(new URL('/health', apiUrl));
    return response.ok;
  } catch {
    return false;
  }
}

function startApi() {
  const child = spawn('pnpm', ['--filter', '@better-suno/api', 'dev'], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));

  return child;
}

async function waitForApi(apiUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isApiReady(apiUrl)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`API did not become ready at ${apiUrl} within ${timeoutMs}ms.`);
}

function buildRequest(args, sourcePath) {
  return {
    sourceAudioPath: sourcePath,
    voiceProfileId: args.voiceProfileId || undefined,
    converterMode: args.converterMode || undefined,
    voiceModelPath: args.voiceModelPath ? resolveProjectPath(args.voiceModelPath) : undefined,
    voiceIndexPath: args.voiceIndexPath ? resolveProjectPath(args.voiceIndexPath) : undefined,
    outputDir: args.outputDir ? resolveProjectPath(args.outputDir) : undefined,
    convertedVocalsPath: args.convertedVocalsPath ? resolveProjectPath(args.convertedVocalsPath) : undefined,
    guideLyrics: args.guideLyrics || undefined,
    guideLyricsPath: args.guideLyricsPath ? resolveProjectPath(args.guideLyricsPath) : undefined,
    vocalGuidePath: args.vocalGuidePath ? resolveProjectPath(args.vocalGuidePath) : undefined,
    melodyMidiPath: args.melodyMidiPath ? resolveProjectPath(args.melodyMidiPath) : undefined,
    alignmentJsonPath: args.alignmentJsonPath ? resolveProjectPath(args.alignmentJsonPath) : undefined,
    alignmentTextGridPath: args.alignmentTextGridPath ? resolveProjectPath(args.alignmentTextGridPath) : undefined,
    syllableMapPath: args.syllableMapPath ? resolveProjectPath(args.syllableMapPath) : undefined,
    vocalGuideLanguage: args.vocalGuideLanguage || undefined,
    vocalGuideMaxMismatchRatio: args.vocalGuideMaxMismatchRatio ?? undefined,
    requireVocalGuideMatch: args.requireVocalGuideMatch || undefined,
    generateVocalGuide: args.generateVocalGuide || undefined,
    extractRhythm: args.extractRhythm || undefined,
    rhythmPath: args.rhythmPath ? resolveProjectPath(args.rhythmPath) : undefined,
    rhythmBeatSource: args.rhythmBeatSource || undefined,
    rhythmSampleRate: args.rhythmSampleRate ?? undefined,
    rhythmHopLength: args.rhythmHopLength ?? undefined,
    converterCommandJson: args.mockConverter ? mockConverterCommandJson() : args.converterCommandJson || undefined,
    converterCwd: args.converterCwd ? resolveProjectPath(args.converterCwd) : undefined,
    separatorModel: args.separatorModel || undefined,
    separatorOutputFormat: args.separatorOutputFormat || undefined,
    separatorChunkDuration: args.separatorChunkDuration || undefined,
    separatorImage: args.separatorImage || undefined,
    rights: {
      hasSourceRights: true,
      hasVoiceConsent: true,
      allowPlatformProcessing: true,
    },
  };
}

async function submitJob(apiUrl, request) {
  const body = await requestJson(new URL('/v1/remix/vocals/jobs', apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!body?.job?.id) {
    throw new Error('API did not return a vocal remix job id.');
  }

  return body.job;
}

async function pollJob(apiUrl, jobId, options) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < options.timeoutMs) {
    const body = await requestJson(new URL(`/v1/remix/vocals/jobs/${jobId}`, apiUrl));
    const job = body.job;
    process.stdout.write(`\rjob ${job.id} status=${job.status}${job.error ? ` error=${job.error}` : ''}   `);

    if (job.status === 'completed') {
      process.stdout.write('\n');
      return job;
    }

    if (job.status === 'failed') {
      process.stdout.write('\n');
      throw new Error(job.error || 'V1 vocal remix job failed.');
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }

  process.stdout.write('\n');
  throw new Error(`V1 vocal remix job timed out after ${options.timeoutMs}ms.`);
}

async function verifyArtifacts(apiUrl, job) {
  if (!Array.isArray(job.artifacts) || job.artifacts.length === 0) {
    throw new Error('Completed job did not return artifacts.');
  }

  for (const artifact of job.artifacts) {
    const artifactUrl = new URL(artifact.url, apiUrl);
    const response = await fetch(artifactUrl);
    if (!response.ok) {
      throw new Error(`Artifact ${artifact.kind} download failed with HTTP ${response.status}: ${artifactUrl}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error(`Artifact ${artifact.kind} is empty: ${artifactUrl}`);
    }

    console.log(`artifact ${artifact.kind}: ${bytes.length} bytes ${artifact.path || artifactUrl}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.source) {
    printUsage();
    throw new Error('Missing source audio file.');
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number.');
  }

  if (!Number.isFinite(args.pollMs) || args.pollMs <= 0) {
    throw new Error('--poll-ms must be a positive number.');
  }

  if (
    args.vocalGuideMaxMismatchRatio != null &&
    (!Number.isFinite(args.vocalGuideMaxMismatchRatio) ||
      args.vocalGuideMaxMismatchRatio < 0 ||
      args.vocalGuideMaxMismatchRatio > 1)
  ) {
    throw new Error('--vocal-guide-max-mismatch-ratio must be between 0 and 1.');
  }
  if (args.rhythmSampleRate != null && (!Number.isFinite(args.rhythmSampleRate) || args.rhythmSampleRate <= 0)) {
    throw new Error('--rhythm-sample-rate must be a positive number.');
  }
  if (args.rhythmHopLength != null && (!Number.isFinite(args.rhythmHopLength) || args.rhythmHopLength <= 0)) {
    throw new Error('--rhythm-hop-length must be a positive number.');
  }
  if (args.rhythmBeatSource && !['vocals', 'instrumental', 'mix', 'auto'].includes(args.rhythmBeatSource)) {
    throw new Error('--rhythm-beat-source must be vocals, instrumental, mix, or auto.');
  }

  const sourcePath = ensureFile(args.source, 'Source audio');
  if (args.voiceModelPath) {
    ensureFile(args.voiceModelPath, 'Voice model');
  }
  if (args.voiceIndexPath) {
    ensureFile(args.voiceIndexPath, 'Voice index');
  }
  validateConverterMode(args.converterMode);
  if (args.mockConverter) {
    validateCommandJson(args.mockConverter ? mockConverterCommandJson() : args.converterCommandJson);
  } else if (args.converterCommandJson) {
    validateCommandJson(args.converterCommandJson);
  } else if (!args.voiceProfileId && args.converterMode !== 'svc' && args.converterMode !== 'rvc') {
    throw new Error('Missing converter command. Pass --converter-command-json, --voice-profile, or an SVC/RVC converter mode.');
  }

  let apiProcess = null;
  const stopApi = () => {
    if (apiProcess && !apiProcess.killed) {
      apiProcess.kill('SIGTERM');
    }
  };

  process.once('SIGINT', () => {
    stopApi();
    process.exit(130);
  });

  try {
    if (!(await isApiReady(args.apiUrl))) {
      if (!args.startApi) {
        throw new Error(`API is not reachable at ${args.apiUrl}. Start it or omit --no-start-api.`);
      }

      console.log(`starting API at ${args.apiUrl}...`);
      apiProcess = startApi();
      await waitForApi(args.apiUrl, 30000);
    }

    const request = buildRequest(args, sourcePath);
    const createdJob = await submitJob(args.apiUrl, request);
    console.log(`submitted job ${createdJob.id}`);

    const completedJob = await pollJob(args.apiUrl, createdJob.id, args);
    await verifyArtifacts(args.apiUrl, completedJob);
    console.log(`completed V1 vocals E2E job ${completedJob.id}`);
  } finally {
    stopApi();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
