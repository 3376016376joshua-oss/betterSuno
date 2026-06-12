'use strict';

const path = require('node:path');

const { separateVocalsAndInstrumental } = require('../separate-audio');
const { ensureDirectory, ensureNonEmptyFile } = require('./command-runner');
const { alignLyricsToVocals, shouldGenerateLyricsAlignment } = require('./lyrics-alignment');
const { extractRhythm, shouldExtractRhythm } = require('./rhythm');
const { convertVocalsWithCommand } = require('./voice-conversion');
const { generateVocalGuide, shouldGenerateVocalGuide } = require('./vocal-guide');

const projectRoot = path.resolve(__dirname, '..', '..');

function defaultOutputDirFor(inputAudioFile) {
  const inputName = path.basename(inputAudioFile, path.extname(inputAudioFile));
  return path.join(projectRoot, 'storage', 'remix-v1-vocals', inputName);
}

async function runVocalConversionPipeline(inputAudioFile, options = {}) {
  const outputDir = ensureDirectory(options.outputDir || defaultOutputDirFor(inputAudioFile));
  const stemsDir = ensureDirectory(options.stemsDir || path.join(outputDir, 'stems'));
  const conversionDir = ensureDirectory(options.conversionDir || path.join(outputDir, 'conversion'));
  const convertedVocalsPath = path.resolve(options.convertedVocalsPath || path.join(conversionDir, 'converted-vocals.wav'));
  const onStage = typeof options.onStage === 'function' ? options.onStage : () => {};
  let rhythmAnalysis = null;
  let lyricsAlignment = null;
  let vocalGuide = null;

  onStage('separating');
  const separation = await separateVocalsAndInstrumental(inputAudioFile, {
    outputDir: stemsDir,
    model: options.separatorModel,
    outputFormat: options.separatorOutputFormat,
    chunkDuration: options.separatorChunkDuration,
    image: options.separatorImage,
    stdio: options.stdio,
  });

  ensureNonEmptyFile(separation.vocalsPath, 'Separated vocals file');
  ensureNonEmptyFile(separation.instrumentalPath, 'Separated instrumental file');

  if (shouldGenerateLyricsAlignment(options)) {
    const alignmentDir = ensureDirectory(options.lyricsAlignmentDir || path.join(outputDir, 'alignment'));
    onStage('aligning');
    lyricsAlignment = await alignLyricsToVocals(separation.vocalsPath, {
      outputPath: options.lyricsAlignmentPath || path.join(alignmentDir, 'lyrics-alignment.json'),
      textGridPath:
        options.lyricsAlignmentTextGridPath || path.join(alignmentDir, 'lyrics-alignment.TextGrid'),
      originalLyrics: options.originalLyrics ?? options.sourceLyrics,
      originalLyricsPath: options.originalLyricsPath ?? options.sourceLyricsPath,
      provider: options.lyricsAlignmentProvider,
      language: options.lyricsAlignmentLanguage,
      pythonBin: options.lyricsAlignmentPythonBin,
      workDir: options.lyricsAlignmentWorkDir || path.join(alignmentDir, '.work'),
      mfaBin: options.mfaBin,
      mfaDictionary: options.mfaDictionary || options.mfaDictionaryPath,
      mfaAcousticModel: options.mfaAcousticModel || options.mfaAcousticModelPath,
      mfaOutputFormat: options.mfaOutputFormat,
      mfaExtraArgs: options.mfaExtraArgs,
      whisperxBin: options.whisperxBin,
      whisperxModel: options.whisperxModel,
      whisperxDevice: options.whisperxDevice,
      whisperxComputeType: options.whisperxComputeType,
      whisperxBatchSize: options.whisperxBatchSize,
      whisperxAlignModel: options.whisperxAlignModel,
      whisperxExtraArgs: options.whisperxExtraArgs,
      requirePhones: options.requireLyricsAlignmentPhones,
      pretty: options.lyricsAlignmentPretty,
      env: options.lyricsAlignmentEnv,
    });
  }

  if (shouldExtractRhythm(options)) {
    const rhythmDir = ensureDirectory(options.rhythmDir || path.join(outputDir, 'rhythm'));
    const rhythmBeatSource = options.rhythmBeatSource || 'vocals';
    onStage('analyzing');
    rhythmAnalysis = await extractRhythm(separation.vocalsPath, {
      instrumentalPath:
        rhythmBeatSource === 'instrumental' || rhythmBeatSource === 'auto' ? separation.instrumentalPath : null,
      mixPath:
        rhythmBeatSource === 'mix' || rhythmBeatSource === 'auto'
          ? options.rhythmMixPath || options.mixPath || inputAudioFile
          : null,
      outputPath: options.rhythmPath || path.join(rhythmDir, 'rhythm.json'),
      beatSource: rhythmBeatSource,
      pythonBin: options.rhythmPythonBin,
      sampleRate: options.rhythmSampleRate,
      hopLength: options.rhythmHopLength,
      frameLength: options.rhythmFrameLength,
      beatTightness: options.rhythmBeatTightness,
      beatTrim: options.rhythmBeatTrim,
      startBpm: options.rhythmStartBpm,
      energyPercentile: options.rhythmEnergyPercentile,
      phraseGapSeconds: options.rhythmPhraseGapSeconds,
      minPhraseDurationSeconds: options.rhythmMinPhraseDurationSeconds,
      minSyllableDurationSeconds: options.rhythmMinSyllableDurationSeconds,
      onsetDelta: options.rhythmOnsetDelta,
      onsetWait: options.rhythmOnsetWait,
      pretty: options.rhythmPretty,
      env: options.rhythmEnv,
    });
  }

  if (shouldGenerateVocalGuide(options)) {
    const guideDir = ensureDirectory(options.guideDir || path.join(outputDir, 'guide'));
    onStage('guiding');
    vocalGuide = await generateVocalGuide(separation.vocalsPath, {
      outputPath: options.vocalGuidePath || path.join(guideDir, 'vocal-guide.json'),
      melodyMidiPath: options.melodyMidiPath || path.join(guideDir, 'melody.mid'),
      alignmentJsonPath: options.alignmentJsonPath || path.join(guideDir, 'alignment.json'),
      alignmentTextGridPath: options.alignmentTextGridPath || path.join(guideDir, 'alignment.TextGrid'),
      syllableMapPath: options.syllableMapPath || path.join(guideDir, 'syllable-map.json'),
      lyrics: options.vocalGuideLyrics ?? options.guideLyrics ?? options.lyrics,
      lyricsPath: options.vocalGuideLyricsPath ?? options.guideLyricsPath ?? options.lyricsPath,
      language: options.vocalGuideLanguage ?? options.guideLanguage,
      pythonBin: options.vocalGuidePythonBin,
      sampleRate: options.vocalGuideSampleRate,
      hopLength: options.vocalGuideHopLength,
      frameLength: options.vocalGuideFrameLength,
      fmin: options.vocalGuideFmin,
      fmax: options.vocalGuideFmax,
      maxMismatchRatio: options.vocalGuideMaxMismatchRatio,
      requireMatch: options.requireVocalGuideMatch,
      pretty: options.vocalGuidePretty,
      env: options.vocalGuideEnv,
    });
  }

  onStage('converting');
  const conversion = await convertVocalsWithCommand(separation.vocalsPath, {
    commandParts: options.converterCommandParts,
    commandJson: options.converterCommandJson,
    commandBin: options.converterBin,
    commandArgs: options.converterArgs,
    convertedVocalsPath,
    outputPath: convertedVocalsPath,
    voiceProfileId: options.voiceProfileId,
    voiceModelPath: options.voiceModelPath,
    voiceIndexPath: options.voiceIndexPath,
    workDir: conversionDir,
    cwd: options.converterCwd,
    env: options.converterEnv,
    stdio: options.stdio,
  });

  onStage('completed');
  return {
    inputAudioPath: path.resolve(inputAudioFile),
    outputDir,
    vocalsPath: separation.vocalsPath,
    instrumentalPath: separation.instrumentalPath,
    convertedVocalsPath: conversion.convertedVocalsPath,
    lyricsAlignmentPath: lyricsAlignment?.alignmentPath,
    lyricsAlignmentTextGridPath: lyricsAlignment?.alignmentTextGridPath,
    lyricsAlignment: lyricsAlignment?.alignment,
    rhythmPath: rhythmAnalysis?.rhythmPath,
    rhythm: rhythmAnalysis?.rhythm,
    vocalGuidePath: vocalGuide?.guidePath,
    melodyMidiPath: vocalGuide?.melodyMidiPath,
    alignmentJsonPath: vocalGuide?.alignmentJsonPath,
    alignmentTextGridPath: vocalGuide?.alignmentTextGridPath,
    syllableMapPath: vocalGuide?.syllableMapPath,
    vocalGuide: vocalGuide?.guide,
    separation,
    lyricsAlignmentResult: lyricsAlignment,
    rhythmAnalysis,
    guide: vocalGuide,
    conversion,
  };
}

module.exports = {
  defaultOutputDirFor,
  runVocalConversionPipeline,
};
