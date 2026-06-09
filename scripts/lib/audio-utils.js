'use strict';

const path = require('node:path');

const {
  ensureDirectory,
  ensureNonEmptyFile,
  resolvePath,
  runCommand,
  runCommandCapture,
} = require('./command-runner');

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function probeAudio(audioFile, options = {}) {
  const inputPath = ensureNonEmptyFile(audioFile, 'Audio file');
  const { stdout } = await runCommandCapture(options.ffprobeBin || 'ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ], {
    label: 'ffprobe',
  });

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ffprobe returned invalid JSON: ${error.message}`);
  }

  const audioStream = Array.isArray(payload.streams)
    ? payload.streams.find((stream) => stream.codec_type === 'audio')
    : null;

  if (!audioStream) {
    throw new Error(`No audio stream found: ${inputPath}`);
  }

  return {
    path: inputPath,
    formatName: payload.format?.format_name || null,
    durationSeconds: parseNumber(audioStream.duration) || parseNumber(payload.format?.duration),
    sampleRate: parseNumber(audioStream.sample_rate),
    channels: parseNumber(audioStream.channels),
    codecName: audioStream.codec_name || null,
    bitRate: parseNumber(audioStream.bit_rate || payload.format?.bit_rate),
  };
}

async function measureMaxVolumeDb(audioFile, options = {}) {
  const inputPath = ensureNonEmptyFile(audioFile, 'Audio file');
  const { stderr } = await runCommandCapture(options.ffmpegBin || 'ffmpeg', [
    '-hide_banner',
    '-i',
    inputPath,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ], {
    label: 'ffmpeg volumedetect',
  });
  const match = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/i);

  return {
    maxVolumeDb: match ? Number(match[1]) : null,
    raw: stderr,
  };
}

async function mixVocalsWithInstrumental(instrumentalFile, vocalsFile, outputFile, options = {}) {
  const instrumentalPath = ensureNonEmptyFile(instrumentalFile, 'Instrumental file');
  const vocalsPath = ensureNonEmptyFile(vocalsFile, 'Converted vocals file');
  const outputPath = resolvePath(outputFile);
  ensureDirectory(path.dirname(outputPath));

  const sampleRate = Number(options.sampleRate || 48000);
  const vocalGain = Number(options.vocalGain ?? 1);
  const instrumentalGain = Number(options.instrumentalGain ?? 1);
  const limiter = Number(options.limiter ?? 0.98);
  const codecArgs = outputPath.toLowerCase().endsWith('.wav')
    ? ['-c:a', 'pcm_s16le']
    : ['-c:a', 'aac', '-b:a', '256k'];
  const filter = [
    `[0:a]aresample=${sampleRate},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${instrumentalGain}[inst]`,
    `[1:a]aresample=${sampleRate},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vocalGain}[vox]`,
    `[inst][vox]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=${limiter}[out]`,
  ].join(';');

  await runCommand(options.ffmpegBin || 'ffmpeg', [
    '-y',
    '-hide_banner',
    '-i',
    instrumentalPath,
    '-i',
    vocalsPath,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    ...codecArgs,
    outputPath,
  ], {
    label: 'ffmpeg mix',
    stdio: options.stdio,
  });

  return {
    masterPath: ensureNonEmptyFile(outputPath, 'Master audio file'),
    sampleRate,
    vocalGain,
    instrumentalGain,
    limiter,
  };
}

async function inspectVocalConversion(vocalsFile, convertedVocalsFile, options = {}) {
  const [sourceVocals, convertedVocals] = await Promise.all([
    probeAudio(vocalsFile, options),
    probeAudio(convertedVocalsFile, options),
  ]);
  const durationDriftSeconds =
    sourceVocals.durationSeconds != null && convertedVocals.durationSeconds != null
      ? convertedVocals.durationSeconds - sourceVocals.durationSeconds
      : null;
  const tolerance = Number(options.durationToleranceSeconds ?? 0.5);
  const warnings = [];

  if (durationDriftSeconds != null && Math.abs(durationDriftSeconds) > tolerance) {
    warnings.push(`Converted vocals duration drift is ${durationDriftSeconds.toFixed(3)}s.`);
  }

  let convertedMaxVolume = null;
  try {
    convertedMaxVolume = await measureMaxVolumeDb(convertedVocalsFile, options);
    if (convertedMaxVolume.maxVolumeDb != null && convertedMaxVolume.maxVolumeDb >= -0.1) {
      warnings.push('Converted vocals may be clipping or too close to 0 dBFS.');
    }
  } catch (error) {
    warnings.push(`Could not measure converted vocal max volume: ${error.message}`);
  }

  return {
    sourceVocals,
    convertedVocals,
    durationDriftSeconds,
    durationToleranceSeconds: tolerance,
    convertedMaxVolumeDb: convertedMaxVolume?.maxVolumeDb ?? null,
    warnings,
  };
}

module.exports = {
  inspectVocalConversion,
  measureMaxVolumeDb,
  mixVocalsWithInstrumental,
  probeAudio,
};
