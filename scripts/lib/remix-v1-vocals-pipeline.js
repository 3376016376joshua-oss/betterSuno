'use strict';

const path = require('node:path');

const { separateVocalsAndInstrumental } = require('../separate-audio');
const { ensureDirectory, ensureNonEmptyFile } = require('./command-runner');
const { convertVocalsWithCommand } = require('./voice-conversion');

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
    separation,
    conversion,
  };
}

module.exports = {
  defaultOutputDirFor,
  runVocalConversionPipeline,
};
