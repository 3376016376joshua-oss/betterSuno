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

function shouldGenerateLyricsAlignment(options = {}) {
  const provider = options.lyricsAlignmentProvider || options.provider;

  return Boolean(
    options.generateLyricsAlignment ||
      options.alignLyrics ||
      options.originalLyrics ||
      options.originalLyricsPath ||
      options.sourceLyrics ||
      options.sourceLyricsPath ||
      (provider && provider !== 'auto') ||
      options.lyricsAlignmentPath ||
      options.lyricsAlignmentTextGridPath
  );
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

function addRepeatedArgs(args, name, values) {
  for (const value of values || []) {
    if (value != null && String(value).trim()) {
      args.push(name, String(value));
    }
  }
}

function resolveAlignmentOutputPath(options = {}) {
  return resolvePath(
    options.lyricsAlignmentPath ||
      options.outputPath ||
      path.join(options.outputDir || process.cwd(), 'lyrics-alignment.json')
  );
}

async function alignLyricsToVocals(vocalsFile, options = {}) {
  const vocalsPath = ensureNonEmptyFile(vocalsFile, 'Lyrics alignment input vocals');
  const outputPath = resolveAlignmentOutputPath(options);
  const textGridOutput = resolveOptionalPath(
    options.lyricsAlignmentTextGridPath || options.textGridPath || options.textGridOutputPath
  );
  const pythonBin =
    options.pythonBin ||
    options.lyricsAlignmentPythonBin ||
    process.env.BETTER_SUNO_LYRICS_ALIGNMENT_PYTHON ||
    'python3';
  const lyrics = options.originalLyrics ?? options.sourceLyrics;
  const lyricsPath = options.originalLyricsPath || options.sourceLyricsPath;
  const language = options.language || options.lyricsAlignmentLanguage || 'auto';
  const provider = options.provider || options.lyricsAlignmentProvider || 'auto';
  const workDir = resolveOptionalPath(
    options.workDir ||
      options.lyricsAlignmentWorkDir ||
      path.join(path.dirname(outputPath), '.lyrics-alignment-work')
  );

  ensureDirectory(path.dirname(outputPath));
  if (textGridOutput) {
    ensureDirectory(path.dirname(textGridOutput));
  }
  if (workDir) {
    ensureDirectory(workDir);
  }

  const args = [
    '-m',
    'better_suno_worker.lyrics_alignment.cli',
    '--vocals',
    vocalsPath,
    '--output',
    outputPath,
    '--provider',
    provider,
    '--language',
    language,
  ];

  if (textGridOutput) {
    args.push('--textgrid-output', textGridOutput);
  }
  if (lyrics != null && String(lyrics).trim()) {
    args.push('--lyrics', String(lyrics));
  }
  if (lyricsPath) {
    args.push('--lyrics-file', ensureFile(lyricsPath, 'Original lyrics file'));
  }
  if (workDir) {
    args.push('--work-dir', workDir);
  }

  if (options.mfaBin || options.lyricsAlignmentMfaBin) {
    args.push('--mfa-bin', String(options.mfaBin || options.lyricsAlignmentMfaBin));
  }
  if (options.mfaDictionary || options.mfaDictionaryPath || options.lyricsAlignmentMfaDictionary) {
    args.push(
      '--mfa-dictionary',
      String(options.mfaDictionary || options.mfaDictionaryPath || options.lyricsAlignmentMfaDictionary)
    );
  }
  if (options.mfaAcousticModel || options.mfaAcousticModelPath || options.lyricsAlignmentMfaAcousticModel) {
    args.push(
      '--mfa-acoustic-model',
      String(
        options.mfaAcousticModel ||
          options.mfaAcousticModelPath ||
          options.lyricsAlignmentMfaAcousticModel
      )
    );
  }
  if (options.mfaOutputFormat || options.lyricsAlignmentMfaOutputFormat) {
    args.push('--mfa-output-format', String(options.mfaOutputFormat || options.lyricsAlignmentMfaOutputFormat));
  }
  if (options.mfaNormalizeTranscript === false || options.lyricsAlignmentMfaNormalizeTranscript === false) {
    args.push('--no-mfa-normalize-transcript');
  }
  addRepeatedArgs(args, '--mfa-extra-arg', options.mfaExtraArgs || options.lyricsAlignmentMfaExtraArgs);

  if (options.whisperxBin || options.lyricsAlignmentWhisperxBin) {
    args.push('--whisperx-bin', String(options.whisperxBin || options.lyricsAlignmentWhisperxBin));
  }
  if (options.whisperxModel || options.lyricsAlignmentWhisperxModel) {
    args.push('--whisperx-model', String(options.whisperxModel || options.lyricsAlignmentWhisperxModel));
  }
  if (options.whisperxDevice || options.lyricsAlignmentWhisperxDevice) {
    args.push('--whisperx-device', String(options.whisperxDevice || options.lyricsAlignmentWhisperxDevice));
  }
  if (options.whisperxComputeType || options.lyricsAlignmentWhisperxComputeType) {
    args.push(
      '--whisperx-compute-type',
      String(options.whisperxComputeType || options.lyricsAlignmentWhisperxComputeType)
    );
  }
  addOptionalNumberArg(
    args,
    '--whisperx-batch-size',
    options.whisperxBatchSize ?? options.lyricsAlignmentWhisperxBatchSize
  );
  if (options.whisperxAlignModel || options.lyricsAlignmentWhisperxAlignModel) {
    args.push(
      '--whisperx-align-model',
      String(options.whisperxAlignModel || options.lyricsAlignmentWhisperxAlignModel)
    );
  }
  addRepeatedArgs(
    args,
    '--whisperx-extra-arg',
    options.whisperxExtraArgs || options.lyricsAlignmentWhisperxExtraArgs
  );

  if (options.requirePhones || options.requireLyricsAlignmentPhones) {
    args.push('--require-phones');
  }
  if (options.pretty || options.lyricsAlignmentPretty) {
    args.push('--pretty');
  }

  const env = {
    PYTHONPATH: [workerDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    ...(options.env || options.lyricsAlignmentEnv || {}),
  };

  const result = await runCommandCapture(pythonBin, args, {
    cwd: workerDir,
    env,
    label: 'lyrics alignment',
  });
  const alignment = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  let summary = null;
  const trimmedStdout = result.stdout.trim();
  if (trimmedStdout) {
    try {
      summary = JSON.parse(trimmedStdout.split('\n').at(-1));
    } catch {
      summary = null;
    }
  }

  return {
    alignmentPath: outputPath,
    alignmentTextGridPath: textGridOutput,
    alignment,
    summary,
  };
}

module.exports = {
  alignLyricsToVocals,
  shouldGenerateLyricsAlignment,
};
