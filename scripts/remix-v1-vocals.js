#!/usr/bin/env node
'use strict';

const { runVocalConversionPipeline, defaultOutputDirFor } = require('./lib/remix-v1-vocals-pipeline');

function printUsage() {
  console.log(`
Usage:
  node scripts/remix-v1-vocals.js <audio-file> [options]

Runs the first three V1 steps:
  1. Separate source audio into vocals/instrumental
  2. Call a configured SVC/RVC inference command
  3. Write converted-vocals.wav

Options:
  --out-dir <dir>                  Output directory. Defaults to storage/remix-v1-vocals/<input-name>
  --voice-profile <id>             Voice profile id passed to the converter placeholder {voiceProfileId}
  --voice-model <path>             Voice model/adapter path passed as {voiceModel}
  --voice-index <path>             Optional feature index path passed as {voiceIndex}
  --converted-output <path>        Converted vocal output path. Defaults to <out-dir>/conversion/converted-vocals.wav

  --original-lyrics <text>         Original lyrics used for source vocal forced alignment
  --original-lyrics-file <path>    UTF-8 original lyrics file
  --generate-lyrics-alignment      Generate source lyrics/phoneme alignment even without lyrics
  --lyrics-alignment-provider <p>  auto, mfa, whisperx, or whisperx-mfa. Defaults to auto
  --lyrics-alignment-output <path> Source lyrics/phoneme alignment JSON path
  --lyrics-alignment-textgrid-output <path>
                                   Source lyrics/phoneme TextGrid path
  --lyrics-alignment-python <bin>  Python executable for lyrics alignment. Defaults to python3
  --lyrics-alignment-language <l>  Alignment language hint. Defaults to auto
  --require-lyrics-alignment-phones
                                   Fail when the selected provider produces no phone tier
  --mfa-bin <bin>                  Montreal Forced Aligner executable. Defaults to mfa
  --mfa-dictionary <path|name>     MFA dictionary path or installed dictionary name
  --mfa-acoustic-model <path|name> MFA acoustic model path or installed model name
  --whisperx-bin <bin>             WhisperX executable. Defaults to whisperx
  --whisperx-model <model>         WhisperX model. Defaults to large-v3
  --whisperx-device <device>       WhisperX device. Defaults to cpu
  --whisperx-compute-type <type>   WhisperX compute type. Defaults to int8

  --guide-lyrics <text>            Replacement lyrics to align into vocal guide slots
  --guide-lyrics-file <path>       UTF-8 replacement lyrics file
  --vocal-guide-output <path>      Guide JSON path. Defaults to <out-dir>/guide/vocal-guide.json
  --melody-midi-output <path>      Melody MIDI path. Defaults to <out-dir>/guide/melody.mid
  --alignment-json-output <path>   Alignment JSON path. Defaults to <out-dir>/guide/alignment.json
  --alignment-textgrid-output <path>
                                   TextGrid path. Defaults to <out-dir>/guide/alignment.TextGrid
  --syllable-map-output <path>     Syllable map path. Defaults to <out-dir>/guide/syllable-map.json
  --vocal-guide-python <bin>       Python executable for guide extraction. Defaults to python3
  --vocal-guide-language <lang>    Lyric language hint. Defaults to auto
  --vocal-guide-max-mismatch-ratio <n>
                                   Accepted syllable/slot mismatch ratio. Defaults to 0.2
  --require-vocal-guide-match      Fail when new lyrics do not roughly match guide slots
  --generate-vocal-guide           Generate melody/rhythm guide even without replacement lyrics
  --extract-rhythm                 Generate rhythm.json with beat grid, phrases, and vocal onsets
  --rhythm-output <path>           Rhythm JSON path. Defaults to <out-dir>/rhythm/rhythm.json
  --rhythm-python <bin>            Python executable for rhythm extraction. Defaults to python3
  --rhythm-beat-source <source>    vocals, instrumental, mix, or auto. Defaults to vocals
  --rhythm-sample-rate <hz>        Analysis sample rate. Defaults to 22050
  --rhythm-hop-length <samples>    Analysis hop length. Defaults to 512

  --converter-command-json <json>  JSON array command template.
                                   Example: '["python","infer.py","--input","{input}","--output","{output}"]'
  --converter-bin <bin>            Converter executable, used with repeated --converter-arg
  --converter-arg <arg>            Converter argument. May be repeated. Supports placeholders.
  --converter-cwd <dir>            Working directory for converter command.

  --separator-model <filename>     audio-separator model filename
  --separator-format <format>      Separator output format. Defaults to WAV
  --separator-chunk-duration <sec> Process long files in chunks
  --separator-image <docker-image> audio-separator Docker image
  --help                          Show this help

Placeholders available to converter args:
  {input}           Separated vocals file
  {output}          Converted vocals output file
  {voiceProfileId}  Voice profile id
  {voiceModel}      Voice model/adapter path
  {voiceIndex}      Voice feature index path
  {workDir}         Conversion work directory

Environment:
  VOICE_CONVERTER_COMMAND_JSON can provide the converter command JSON array.

Example:
  node scripts/remix-v1-vocals.js ./source.mp3 \\
    --voice-profile demo \\
    --voice-model ./storage/voice-profiles/demo/adapter.safetensors \\
    --converter-command-json '["python","/path/to/svc/infer.py","--input","{input}","--output","{output}","--model","{voiceModel}"]'
`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    outputDir: null,
    voiceProfileId: null,
    voiceModelPath: null,
    voiceIndexPath: null,
    convertedVocalsPath: null,
    originalLyrics: null,
    originalLyricsPath: null,
    generateLyricsAlignment: false,
    lyricsAlignmentProvider: null,
    lyricsAlignmentPath: null,
    lyricsAlignmentTextGridPath: null,
    lyricsAlignmentPythonBin: null,
    lyricsAlignmentLanguage: null,
    requireLyricsAlignmentPhones: false,
    mfaBin: null,
    mfaDictionary: null,
    mfaAcousticModel: null,
    whisperxBin: null,
    whisperxModel: null,
    whisperxDevice: null,
    whisperxComputeType: null,
    guideLyrics: null,
    guideLyricsPath: null,
    vocalGuidePath: null,
    melodyMidiPath: null,
    alignmentJsonPath: null,
    alignmentTextGridPath: null,
    syllableMapPath: null,
    vocalGuidePythonBin: null,
    vocalGuideLanguage: null,
    vocalGuideMaxMismatchRatio: null,
    requireVocalGuideMatch: false,
    generateVocalGuide: false,
    extractRhythm: false,
    rhythmPath: null,
    rhythmPythonBin: null,
    rhythmBeatSource: null,
    rhythmSampleRate: null,
    rhythmHopLength: null,
    converterCommandJson: null,
    converterBin: null,
    converterArgs: [],
    converterCwd: null,
    separatorModel: null,
    separatorOutputFormat: null,
    separatorChunkDuration: null,
    separatorImage: null,
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

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--out-dir') {
      args.outputDir = next();
    } else if (arg === '--voice-profile') {
      args.voiceProfileId = next();
    } else if (arg === '--voice-model') {
      args.voiceModelPath = next();
    } else if (arg === '--voice-index') {
      args.voiceIndexPath = next();
    } else if (arg === '--converted-output') {
      args.convertedVocalsPath = next();
    } else if (arg === '--original-lyrics') {
      args.originalLyrics = next();
    } else if (arg === '--original-lyrics-file') {
      args.originalLyricsPath = next();
    } else if (arg === '--generate-lyrics-alignment') {
      args.generateLyricsAlignment = true;
    } else if (arg === '--lyrics-alignment-provider') {
      args.lyricsAlignmentProvider = next();
    } else if (arg === '--lyrics-alignment-output') {
      args.lyricsAlignmentPath = next();
    } else if (arg === '--lyrics-alignment-textgrid-output') {
      args.lyricsAlignmentTextGridPath = next();
    } else if (arg === '--lyrics-alignment-python') {
      args.lyricsAlignmentPythonBin = next();
    } else if (arg === '--lyrics-alignment-language') {
      args.lyricsAlignmentLanguage = next();
    } else if (arg === '--require-lyrics-alignment-phones') {
      args.requireLyricsAlignmentPhones = true;
    } else if (arg === '--mfa-bin') {
      args.mfaBin = next();
    } else if (arg === '--mfa-dictionary') {
      args.mfaDictionary = next();
    } else if (arg === '--mfa-acoustic-model') {
      args.mfaAcousticModel = next();
    } else if (arg === '--whisperx-bin') {
      args.whisperxBin = next();
    } else if (arg === '--whisperx-model') {
      args.whisperxModel = next();
    } else if (arg === '--whisperx-device') {
      args.whisperxDevice = next();
    } else if (arg === '--whisperx-compute-type') {
      args.whisperxComputeType = next();
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
    } else if (arg === '--vocal-guide-python') {
      args.vocalGuidePythonBin = next();
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
    } else if (arg === '--rhythm-python') {
      args.rhythmPythonBin = next();
    } else if (arg === '--rhythm-beat-source') {
      args.rhythmBeatSource = next();
    } else if (arg === '--rhythm-sample-rate') {
      args.rhythmSampleRate = Number(next());
    } else if (arg === '--rhythm-hop-length') {
      args.rhythmHopLength = Number(next());
    } else if (arg === '--converter-command-json') {
      args.converterCommandJson = next();
    } else if (arg === '--converter-bin') {
      args.converterBin = next();
    } else if (arg === '--converter-arg') {
      args.converterArgs.push(next());
    } else if (arg === '--converter-cwd') {
      args.converterCwd = next();
    } else if (arg === '--separator-model') {
      args.separatorModel = next();
    } else if (arg === '--separator-format') {
      args.separatorOutputFormat = next();
    } else if (arg === '--separator-chunk-duration') {
      args.separatorChunkDuration = next();
    } else if (arg === '--separator-image') {
      args.separatorImage = next();
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.input) {
      args.input = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.input) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const result = await runVocalConversionPipeline(args.input, args);

  console.log('\nV1 vocal conversion complete:');
  console.log(`  Output dir:        ${result.outputDir || defaultOutputDirFor(args.input)}`);
  console.log(`  Vocals:            ${result.vocalsPath}`);
  console.log(`  Instrumental:      ${result.instrumentalPath}`);
  if (result.vocalGuidePath) {
    console.log(`  Vocal guide:       ${result.vocalGuidePath}`);
    console.log(`  Melody MIDI:       ${result.melodyMidiPath}`);
    console.log(`  Alignment JSON:    ${result.alignmentJsonPath}`);
    console.log(`  Alignment TextGrid:${result.alignmentTextGridPath}`);
    console.log(`  Syllable map:      ${result.syllableMapPath}`);
    console.log(`  Guide fit:         ${result.vocalGuide?.fit?.status || 'unknown'}`);
  }
  if (result.lyricsAlignmentPath) {
    console.log(`  Lyrics alignment:  ${result.lyricsAlignmentPath}`);
    console.log(`  Alignment TextGrid:${result.lyricsAlignmentTextGridPath}`);
    console.log(`  Aligned words:     ${result.lyricsAlignment?.quality?.wordCount ?? 'unknown'}`);
    console.log(`  Aligned phones:    ${result.lyricsAlignment?.quality?.phoneCount ?? 'unknown'}`);
  }
  if (result.rhythmPath) {
    console.log(`  Rhythm:           ${result.rhythmPath}`);
    console.log(`  Tempo:            ${result.rhythm?.summary?.tempoBpm ?? 'unknown'} BPM`);
  }
  console.log(`  Converted vocals:  ${result.convertedVocalsPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
};
