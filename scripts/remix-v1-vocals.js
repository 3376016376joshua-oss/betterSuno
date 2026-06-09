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
