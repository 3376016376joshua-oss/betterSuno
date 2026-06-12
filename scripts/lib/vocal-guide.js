'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  ensureDirectory,
  ensureFile,
  ensureNonEmptyFile,
  resolvePath,
  runCommandCapture,
} = require('./command-runner');

const projectRoot = path.resolve(__dirname, '..', '..');
const workerDir = path.join(projectRoot, 'services', 'worker');

function shouldGenerateVocalGuide(options = {}) {
  return Boolean(
    options.generateVocalGuide ||
      options.lyrics ||
      options.lyricsPath ||
      options.guideLyrics ||
      options.guideLyricsPath ||
      options.vocalGuideLyrics ||
      options.vocalGuideLyricsPath
  );
}

function resolveGuideOutputPath(options = {}) {
  const outputPath =
    options.vocalGuidePath ||
    options.outputPath ||
    path.join(options.outputDir || process.cwd(), 'vocal-guide.json');
  return resolvePath(outputPath);
}

function resolveOptionalPath(value) {
  return value ? resolvePath(value) : null;
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

async function generateVocalGuide(vocalsFile, options = {}) {
  const vocalsPath = ensureNonEmptyFile(vocalsFile, 'Vocal guide input vocals');
  const outputPath = resolveGuideOutputPath(options);
  const pythonBin = options.pythonBin || options.vocalGuidePythonBin || process.env.BETTER_SUNO_VOCAL_GUIDE_PYTHON || 'python3';
  const lyrics = options.lyrics ?? options.guideLyrics ?? options.vocalGuideLyrics;
  const lyricsPath = options.lyricsPath || options.guideLyricsPath || options.vocalGuideLyricsPath;
  const language = options.language || options.guideLanguage || options.vocalGuideLanguage || 'auto';

  ensureDirectory(path.dirname(outputPath));

  const args = [
    '-m',
    'better_suno_worker.vocal_guide.cli',
    '--vocals',
    vocalsPath,
    '--output',
    outputPath,
    '--language',
    language,
  ];

  const melodyMidiOutput = resolveOptionalPath(options.melodyMidiPath || options.melodyMidiOutputPath);
  const alignmentJsonOutput = resolveOptionalPath(options.alignmentJsonPath || options.alignmentJsonOutputPath);
  const alignmentTextGridOutput = resolveOptionalPath(
    options.alignmentTextGridPath || options.alignmentTextGridOutputPath
  );
  const syllableMapOutput = resolveOptionalPath(options.syllableMapPath || options.syllableMapOutputPath);

  if (melodyMidiOutput) {
    ensureDirectory(path.dirname(melodyMidiOutput));
    args.push('--melody-midi-output', melodyMidiOutput);
  }

  if (alignmentJsonOutput) {
    ensureDirectory(path.dirname(alignmentJsonOutput));
    args.push('--alignment-json-output', alignmentJsonOutput);
  }

  if (alignmentTextGridOutput) {
    ensureDirectory(path.dirname(alignmentTextGridOutput));
    args.push('--alignment-textgrid-output', alignmentTextGridOutput);
  }

  if (syllableMapOutput) {
    ensureDirectory(path.dirname(syllableMapOutput));
    args.push('--syllable-map-output', syllableMapOutput);
  }

  if (lyrics != null && String(lyrics).trim()) {
    args.push('--lyrics', String(lyrics));
  }

  if (lyricsPath) {
    args.push('--lyrics-file', ensureFile(lyricsPath, 'Vocal guide lyrics file'));
  }

  addOptionalNumberArg(args, '--sample-rate', options.sampleRate ?? options.vocalGuideSampleRate);
  addOptionalNumberArg(args, '--hop-length', options.hopLength ?? options.vocalGuideHopLength);
  addOptionalNumberArg(args, '--frame-length', options.frameLength ?? options.vocalGuideFrameLength);
  addOptionalNumberArg(args, '--max-mismatch-ratio', options.maxMismatchRatio ?? options.vocalGuideMaxMismatchRatio);

  if (options.fmin || options.vocalGuideFmin) {
    args.push('--fmin', String(options.fmin || options.vocalGuideFmin));
  }

  if (options.fmax || options.vocalGuideFmax) {
    args.push('--fmax', String(options.fmax || options.vocalGuideFmax));
  }

  if (options.requireMatch || options.requireVocalGuideMatch) {
    args.push('--require-match');
  }

  if (options.pretty || options.vocalGuidePretty) {
    args.push('--pretty');
  }

  const env = {
    PYTHONPATH: [workerDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    ...(options.env || options.vocalGuideEnv || {}),
  };

  let stdout = '';
  try {
    const result = await runCommandCapture(pythonBin, args, {
      cwd: workerDir,
      env,
      label: 'vocal guide generation',
    });
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing vocal guide audio dependencies')) {
      throw new Error(error.message.replace(/^vocal guide generation failed with exit code \d+:\s*/i, ''));
    }
    throw error;
  }

  const rawGuide = fs.readFileSync(outputPath, 'utf8');
  const guide = JSON.parse(rawGuide);
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
    guidePath: outputPath,
    melodyMidiPath: melodyMidiOutput,
    alignmentJsonPath: alignmentJsonOutput,
    alignmentTextGridPath: alignmentTextGridOutput,
    syllableMapPath: syllableMapOutput,
    guide,
    summary,
  };
}

async function fitLyricsToVocalGuide(guideFile, options = {}) {
  const guidePath = ensureNonEmptyFile(guideFile, 'Vocal guide file');
  const outputPath = resolveOptionalPath(options.outputPath || options.fittedGuidePath);
  const syllableMapOutput = resolvePath(options.syllableMapPath || options.syllableMapOutputPath || path.join(process.cwd(), 'syllable-map.json'));
  const alignmentJsonOutput = resolveOptionalPath(options.alignmentJsonPath || options.alignmentJsonOutputPath);
  const alignmentTextGridOutput = resolveOptionalPath(
    options.alignmentTextGridPath || options.alignmentTextGridOutputPath
  );
  const pythonBin = options.pythonBin || options.vocalGuidePythonBin || process.env.BETTER_SUNO_VOCAL_GUIDE_PYTHON || 'python3';
  const lyrics = options.lyrics ?? options.guideLyrics ?? options.vocalGuideLyrics;
  const lyricsPath = options.lyricsPath || options.guideLyricsPath || options.vocalGuideLyricsPath;
  const language = options.language || options.guideLanguage || options.vocalGuideLanguage || 'auto';
  const args = [
    '-m',
    'better_suno_worker.vocal_guide.fit_cli',
    '--guide',
    guidePath,
    '--syllable-map-output',
    syllableMapOutput,
    '--language',
    language,
  ];

  ensureDirectory(path.dirname(syllableMapOutput));

  if (outputPath) {
    ensureDirectory(path.dirname(outputPath));
    args.push('--output', outputPath);
  }

  if (alignmentJsonOutput) {
    ensureDirectory(path.dirname(alignmentJsonOutput));
    args.push('--alignment-json-output', alignmentJsonOutput);
  }

  if (alignmentTextGridOutput) {
    ensureDirectory(path.dirname(alignmentTextGridOutput));
    args.push('--alignment-textgrid-output', alignmentTextGridOutput);
  }

  if (lyrics != null && String(lyrics).trim()) {
    args.push('--lyrics', String(lyrics));
  }

  if (lyricsPath) {
    args.push('--lyrics-file', ensureFile(lyricsPath, 'Vocal guide lyrics file'));
  }

  addOptionalNumberArg(args, '--max-mismatch-ratio', options.maxMismatchRatio ?? options.vocalGuideMaxMismatchRatio);

  if (options.requireMatch || options.requireVocalGuideMatch) {
    args.push('--require-match');
  }

  if (options.pretty || options.vocalGuidePretty) {
    args.push('--pretty');
  }

  const env = {
    PYTHONPATH: [workerDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    ...(options.env || options.vocalGuideEnv || {}),
  };

  const result = await runCommandCapture(pythonBin, args, {
    cwd: workerDir,
    env,
    label: 'vocal guide lyric fitting',
  });
  const fittedGuide = outputPath ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  const syllableMap = JSON.parse(fs.readFileSync(syllableMapOutput, 'utf8'));

  return {
    fittedGuidePath: outputPath,
    syllableMapPath: syllableMapOutput,
    alignmentJsonPath: alignmentJsonOutput,
    alignmentTextGridPath: alignmentTextGridOutput,
    fittedGuide,
    syllableMap,
    summary: JSON.parse(result.stdout.trim().split('\n').at(-1)),
  };
}

module.exports = {
  fitLyricsToVocalGuide,
  generateVocalGuide,
  shouldGenerateVocalGuide,
};
