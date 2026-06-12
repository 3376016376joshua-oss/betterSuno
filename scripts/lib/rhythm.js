'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  ensureDirectory,
  ensureNonEmptyFile,
  resolvePath,
  runCommandCapture,
} = require('./command-runner');

const projectRoot = path.resolve(__dirname, '..', '..');
const workerDir = path.join(projectRoot, 'services', 'worker');

function shouldExtractRhythm(options = {}) {
  return Boolean(
    options.extractRhythm ||
      options.generateRhythm ||
      options.rhythmPath ||
      options.rhythmOutputPath ||
      options.outputRhythmPath
  );
}

function resolveRhythmOutputPath(options = {}) {
  const outputPath =
    options.rhythmPath ||
    options.rhythmOutputPath ||
    options.outputRhythmPath ||
    options.outputPath ||
    path.join(options.outputDir || process.cwd(), 'rhythm.json');
  return resolvePath(outputPath);
}

function addOptionalNumberArg(args, name, value) {
  if (value == null || value === '') {
    return;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number.`);
  }

  args.push(name, String(number));
}

async function extractRhythm(vocalsFile, options = {}) {
  const vocalsPath = ensureNonEmptyFile(vocalsFile, 'Rhythm input vocals');
  const beatSource = options.beatSource || options.rhythmBeatSource || 'vocals';
  const needsInstrumental = beatSource === 'instrumental' || beatSource === 'auto';
  const needsMix = beatSource === 'mix' || beatSource === 'auto';
  const instrumentalPath = options.instrumentalPath && needsInstrumental
    ? ensureNonEmptyFile(options.instrumentalPath, 'Rhythm input instrumental')
    : null;
  const mixPath = options.mixPath && needsMix ? ensureNonEmptyFile(options.mixPath, 'Rhythm input mix') : null;
  const outputPath = resolveRhythmOutputPath(options);
  const pythonBin = options.pythonBin || options.rhythmPythonBin || process.env.BETTER_SUNO_RHYTHM_PYTHON || 'python3';

  ensureDirectory(path.dirname(outputPath));

  const args = [
    '-m',
    'better_suno_worker.rhythm.cli',
    '--vocals',
    vocalsPath,
    '--output',
    outputPath,
    '--beat-source',
    beatSource,
  ];

  if (instrumentalPath) {
    args.push('--instrumental', instrumentalPath);
  }

  if (mixPath) {
    args.push('--mix', mixPath);
  }

  addOptionalNumberArg(args, '--sample-rate', options.sampleRate ?? options.rhythmSampleRate);
  addOptionalNumberArg(args, '--hop-length', options.hopLength ?? options.rhythmHopLength);
  addOptionalNumberArg(args, '--frame-length', options.frameLength ?? options.rhythmFrameLength);
  addOptionalNumberArg(args, '--beat-tightness', options.beatTightness ?? options.rhythmBeatTightness);
  addOptionalNumberArg(args, '--start-bpm', options.startBpm ?? options.rhythmStartBpm);
  addOptionalNumberArg(args, '--energy-percentile', options.energyPercentile ?? options.rhythmEnergyPercentile);
  addOptionalNumberArg(args, '--phrase-gap-seconds', options.phraseGapSeconds ?? options.rhythmPhraseGapSeconds);
  addOptionalNumberArg(
    args,
    '--min-phrase-duration-seconds',
    options.minPhraseDurationSeconds ?? options.rhythmMinPhraseDurationSeconds
  );
  addOptionalNumberArg(
    args,
    '--min-syllable-duration-seconds',
    options.minSyllableDurationSeconds ?? options.rhythmMinSyllableDurationSeconds
  );
  addOptionalNumberArg(args, '--onset-delta', options.onsetDelta ?? options.rhythmOnsetDelta);
  addOptionalNumberArg(args, '--onset-wait', options.onsetWait ?? options.rhythmOnsetWait);

  if (options.beatTrim || options.rhythmBeatTrim) {
    args.push('--beat-trim');
  }

  if (options.pretty || options.rhythmPretty) {
    args.push('--pretty');
  }

  const env = {
    PYTHONPATH: [workerDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    ...(options.env || options.rhythmEnv || {}),
  };

  let stdout = '';
  try {
    const result = await runCommandCapture(pythonBin, args, {
      cwd: workerDir,
      env,
      label: 'rhythm extraction',
    });
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing rhythm audio dependencies')) {
      throw new Error(error.message.replace(/^rhythm extraction failed with exit code \d+:\s*/i, ''));
    }
    throw error;
  }

  const rawRhythm = fs.readFileSync(outputPath, 'utf8');
  const rhythm = JSON.parse(rawRhythm);
  let summary = null;
  const trimmedStdout = stdout.trim();
  if (trimmedStdout) {
    try {
      summary = JSON.parse(trimmedStdout.split('\n').at(-1));
    } catch {
      summary = null;
    }
  }

  return {
    rhythmPath: outputPath,
    rhythm,
    summary,
  };
}

module.exports = {
  extractRhythm,
  shouldExtractRhythm,
};
