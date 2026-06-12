#!/usr/bin/env node
'use strict';

const { runSingingVoiceConversionRemix, defaultOutputDirFor } = require('./lib/remix-v1-pipeline');

function printUsage() {
  console.log(`
Usage:
  node scripts/remix-v1.js <audio-file> [options]

Runs the non-training SVC Remix V1 runtime pipeline:
  1. Separate source audio into vocals/instrumental
  2. Convert vocals with a configured SVC/RVC command
  3. Run basic vocal quality checks
  4. Mix converted vocals back with the original instrumental
  5. Write report.json

Options:
  --out-dir <dir>                  Output directory. Defaults to storage/remix-v1/<input-name>
  --voice-profile <id>             Voice profile id under storage/voice-profiles/<id>
  --voice-profiles-dir <dir>       Voice profiles directory. Defaults to storage/voice-profiles
  --voice-profile-file <path>      Explicit profile manifest JSON file
  --voice-model <path>             Voice model/adapter path passed as {voiceModel}
  --voice-index <path>             Optional feature index path passed as {voiceIndex}
  --converted-output <path>        Converted vocal output path
  --master-output <path>           Final master output path. Defaults to <out-dir>/mix/master.wav
  --report-output <path>           Report output path. Defaults to <out-dir>/report.json

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
  --converter-bin <bin>            Converter executable, used with repeated --converter-arg
  --converter-arg <arg>            Converter argument. May be repeated. Supports placeholders.
  --converter-cwd <dir>            Working directory for converter command.

  --separator-model <filename>     audio-separator model filename
  --separator-format <format>      Separator output format. Defaults to WAV
  --separator-chunk-duration <sec> Process long files in chunks
  --separator-image <docker-image> audio-separator Docker image

  --vocal-gain <number>            Converted vocal gain before mix. Defaults to 1
  --instrumental-gain <number>     Instrumental gain before mix. Defaults to 1
  --mix-sample-rate <hz>           Mix sample rate. Defaults to 48000
  --limiter <number>               FFmpeg alimiter limit. Defaults to 0.98
  --duration-tolerance <sec>       Vocal duration drift tolerance. Defaults to 0.5
  --ffmpeg-bin <path>              ffmpeg executable. Defaults to ffmpeg
  --ffprobe-bin <path>             ffprobe executable. Defaults to ffprobe
  --skip-quality                   Skip ffprobe/volumedetect checks
  --help                          Show this help

Voice profile manifest:
  storage/voice-profiles/<id>/profile.json may define:
    {
      "baseModel": "rvc",
      "adapterPath": "model.pth",
      "indexPath": "model.index",
      "converter": {
        "command": ["python", "/path/to/infer.py", "--input", "{input}", "--output", "{output}", "--model", "{voiceModel}"]
      }
    }

Example:
  node scripts/remix-v1.js ./source.mp3 --voice-profile demo
`);
}

function parseNumberOption(name, value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

function parseArgs(argv) {
  const args = {
    input: null,
    outputDir: null,
    voiceProfileId: null,
    voiceProfilesDir: null,
    voiceProfileFile: null,
    voiceModelPath: null,
    voiceIndexPath: null,
    convertedVocalsPath: null,
    masterPath: null,
    reportPath: null,
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
    vocalGain: null,
    instrumentalGain: null,
    mixSampleRate: null,
    limiter: null,
    durationToleranceSeconds: null,
    ffmpegBin: null,
    ffprobeBin: null,
    skipQuality: false,
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
    } else if (arg === '--voice-profiles-dir') {
      args.voiceProfilesDir = next();
    } else if (arg === '--voice-profile-file') {
      args.voiceProfileFile = next();
    } else if (arg === '--voice-model') {
      args.voiceModelPath = next();
    } else if (arg === '--voice-index') {
      args.voiceIndexPath = next();
    } else if (arg === '--converted-output') {
      args.convertedVocalsPath = next();
    } else if (arg === '--master-output') {
      args.masterPath = next();
    } else if (arg === '--report-output') {
      args.reportPath = next();
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
      args.vocalGuideMaxMismatchRatio = parseNumberOption(arg, next());
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
      args.rhythmSampleRate = parseNumberOption(arg, next());
    } else if (arg === '--rhythm-hop-length') {
      args.rhythmHopLength = parseNumberOption(arg, next());
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
    } else if (arg === '--vocal-gain') {
      args.vocalGain = parseNumberOption(arg, next());
    } else if (arg === '--instrumental-gain') {
      args.instrumentalGain = parseNumberOption(arg, next());
    } else if (arg === '--mix-sample-rate') {
      args.mixSampleRate = parseNumberOption(arg, next());
    } else if (arg === '--limiter') {
      args.limiter = parseNumberOption(arg, next());
    } else if (arg === '--duration-tolerance') {
      args.durationToleranceSeconds = parseNumberOption(arg, next());
    } else if (arg === '--ffmpeg-bin') {
      args.ffmpegBin = next();
    } else if (arg === '--ffprobe-bin') {
      args.ffprobeBin = next();
    } else if (arg === '--skip-quality') {
      args.skipQuality = true;
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

  const result = await runSingingVoiceConversionRemix(args.input, args);

  console.log('\nSVC Remix V1 complete:');
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
  if (result.rhythmPath) {
    console.log(`  Rhythm:           ${result.rhythmPath}`);
    console.log(`  Tempo:            ${result.rhythm?.summary?.tempoBpm ?? 'unknown'} BPM`);
  }
  console.log(`  Converted vocals:  ${result.convertedVocalsPath}`);
  console.log(`  Master:            ${result.masterPath}`);
  console.log(`  Report:            ${result.reportPath}`);
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
