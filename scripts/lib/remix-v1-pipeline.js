'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ensureDirectory } = require('./command-runner');
const { inspectVocalConversion, mixVocalsWithInstrumental, probeAudio } = require('./audio-utils');
const { resolveVoiceProfile } = require('./voice-profile-registry');
const { runVocalConversionPipeline } = require('./remix-v1-vocals-pipeline');

const projectRoot = path.resolve(__dirname, '..', '..');

function defaultOutputDirFor(inputAudioFile) {
  const inputName = path.basename(inputAudioFile, path.extname(inputAudioFile));
  return path.join(projectRoot, 'storage', 'remix-v1', inputName);
}

function writeReport(reportPath, report) {
  ensureDirectory(path.dirname(reportPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function runSingingVoiceConversionRemix(inputAudioFile, options = {}) {
  const outputDir = ensureDirectory(options.outputDir || defaultOutputDirFor(inputAudioFile));
  const profile = resolveVoiceProfile(options);

  const vocalConversion = await runVocalConversionPipeline(inputAudioFile, {
    ...options,
    outputDir,
    converterCommandParts: options.converterCommandParts || profile.converterCommandParts,
    converterCommandJson: options.converterCommandJson || profile.converterCommandJson,
    voiceModelPath: options.voiceModelPath || profile.voiceModelPath,
    voiceIndexPath: options.voiceIndexPath || profile.voiceIndexPath,
  });

  const quality = options.skipQuality
    ? null
    : await inspectVocalConversion(vocalConversion.vocalsPath, vocalConversion.convertedVocalsPath, {
        durationToleranceSeconds: options.durationToleranceSeconds,
        ffmpegBin: options.ffmpegBin,
        ffprobeBin: options.ffprobeBin,
      });

  const mixDir = ensureDirectory(options.mixDir || path.join(outputDir, 'mix'));
  const masterPath = path.resolve(options.masterPath || path.join(mixDir, 'master.wav'));
  const mix = await mixVocalsWithInstrumental(
    vocalConversion.instrumentalPath,
    vocalConversion.convertedVocalsPath,
    masterPath,
    {
      ffmpegBin: options.ffmpegBin,
      instrumentalGain: options.instrumentalGain,
      limiter: options.limiter,
      sampleRate: options.mixSampleRate,
      stdio: options.stdio,
      vocalGain: options.vocalGain,
    }
  );

  const master = options.skipQuality
    ? null
    : await probeAudio(mix.masterPath, {
        ffprobeBin: options.ffprobeBin,
      });
  const report = {
    status: 'completed',
    inputAudioPath: vocalConversion.inputAudioPath,
    outputDir,
    voiceProfile: {
      id: profile.profileId,
      profileDir: profile.profileDir,
      voiceModelPath: profile.voiceModelPath || null,
      voiceIndexPath: profile.voiceIndexPath || null,
      baseModel: profile.metadata.baseModel || null,
    },
    artifacts: {
      vocalsPath: vocalConversion.vocalsPath,
      instrumentalPath: vocalConversion.instrumentalPath,
      convertedVocalsPath: vocalConversion.convertedVocalsPath,
      rhythmPath: vocalConversion.rhythmPath || null,
      vocalGuidePath: vocalConversion.vocalGuidePath || null,
      melodyMidiPath: vocalConversion.melodyMidiPath || null,
      alignmentJsonPath: vocalConversion.alignmentJsonPath || null,
      alignmentTextGridPath: vocalConversion.alignmentTextGridPath || null,
      syllableMapPath: vocalConversion.syllableMapPath || null,
      masterPath: mix.masterPath,
    },
    separation: {
      model: vocalConversion.separation.model,
      outputFormat: vocalConversion.separation.outputFormat,
      outputDir: vocalConversion.separation.outputDir,
    },
    conversion: {
      converter: vocalConversion.conversion.converter,
    },
    rhythm: vocalConversion.rhythm
      ? {
          path: vocalConversion.rhythmPath,
          tempoBpm: vocalConversion.rhythm.summary?.tempoBpm ?? vocalConversion.rhythm.tempoBpm ?? null,
          beatCount: vocalConversion.rhythm.summary?.beatCount ?? vocalConversion.rhythm.beats?.length ?? 0,
          phraseCount: vocalConversion.rhythm.summary?.phraseCount ?? vocalConversion.rhythm.phrases?.length ?? 0,
          vocalOnsetCount:
            vocalConversion.rhythm.summary?.vocalOnsetCount ?? vocalConversion.rhythm.vocalOnsets?.length ?? 0,
          syllableCandidateCount: vocalConversion.rhythm.summary?.syllableCandidateCount ?? 0,
          beatSource: vocalConversion.rhythm.summary?.beatSource ?? null,
          warnings: vocalConversion.rhythm.summary?.warnings ?? vocalConversion.rhythm.warnings ?? [],
        }
      : null,
    vocalGuide: vocalConversion.vocalGuide
      ? {
          path: vocalConversion.vocalGuidePath,
          melodyMidiPath: vocalConversion.melodyMidiPath || null,
          alignmentJsonPath: vocalConversion.alignmentJsonPath || null,
          alignmentTextGridPath: vocalConversion.alignmentTextGridPath || null,
          syllableMapPath: vocalConversion.syllableMapPath || null,
          phraseCount: vocalConversion.vocalGuide.rhythm?.phrases?.length ?? 0,
          slotCount: vocalConversion.vocalGuide.slots?.length ?? 0,
          lyricSyllableCount: vocalConversion.vocalGuide.lyrics?.syllableCount ?? 0,
          fit: vocalConversion.vocalGuide.fit,
        }
      : null,
    mix,
    quality,
    master,
  };
  const reportPath = writeReport(options.reportPath || path.join(outputDir, 'report.json'), report);

  return {
    ...vocalConversion,
    profile,
    quality,
    mix,
    master,
    masterPath: mix.masterPath,
    reportPath,
    report,
  };
}

module.exports = {
  defaultOutputDirFor,
  runSingingVoiceConversionRemix,
};
