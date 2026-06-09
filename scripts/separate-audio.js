#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const defaultImage = process.env.AUDIO_SEPARATOR_IMAGE || 'beveradb/audio-separator:cpu';
const defaultModel = process.env.AUDIO_SEPARATOR_MODEL || 'UVR-MDX-NET-Inst_HQ_3.onnx';
const defaultOutputFormat = process.env.AUDIO_SEPARATOR_OUTPUT_FORMAT || 'WAV';

function printUsage() {
  console.log(`
Usage:
  node scripts/separate-audio.js <audio-file> [options]

Options:
  --out-dir <dir>           Output directory. Defaults to storage/separated-audio/<input-name>
  --model <filename>        audio-separator model filename. Defaults to ${defaultModel}
  --format <format>         Output audio format. Defaults to ${defaultOutputFormat}
  --chunk-duration <sec>    Process long files in chunks to reduce memory pressure
  --image <docker-image>    Docker image. Defaults to ${defaultImage}
  --help                    Show this help

Example:
  node scripts/separate-audio.js ./input.wav
  node scripts/separate-audio.js ./input.mp3 --out-dir ./storage/demo-stems --format WAV
`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    outputDir: null,
    model: defaultModel,
    outputFormat: defaultOutputFormat,
    chunkDuration: null,
    image: defaultImage,
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
    } else if (arg === '--model' || arg === '-m') {
      args.model = next();
    } else if (arg === '--format') {
      args.outputFormat = next();
    } else if (arg === '--chunk-duration') {
      args.chunkDuration = next();
    } else if (arg === '--image') {
      args.image = next();
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

function ensureFile(inputAudioFile) {
  const inputPath = path.resolve(inputAudioFile);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`);
  }
  if (!fs.statSync(inputPath).isFile()) {
    throw new Error(`Input must be a file: ${inputPath}`);
  }
  return inputPath;
}

function defaultOutputDirFor(inputPath) {
  const inputName = path.basename(inputPath, path.extname(inputPath));
  return path.join(projectRoot, 'storage', 'separated-audio', inputName);
}

function dockerVolume(hostPath, containerPath, mode) {
  const suffix = mode ? `:${mode}` : '';
  return `${hostPath}:${containerPath}${suffix}`;
}

function runDocker(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: projectRoot,
      stdio: options.stdio || 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`audio-separator Docker run failed with exit code ${code}`));
    });
  });
}

function findStemFile(outputDir, stemName, outputFormat) {
  const extension = `.${String(outputFormat).toLowerCase()}`;
  const files = fs.readdirSync(outputDir);
  const exact = files.find((file) => file.toLowerCase() === `${stemName.toLowerCase()}${extension}`);
  if (exact) {
    return path.join(outputDir, exact);
  }

  const fallback = files.find((file) => {
    const lower = file.toLowerCase();
    return lower.includes(stemName.toLowerCase()) && lower.endsWith(extension);
  });

  return fallback ? path.join(outputDir, fallback) : null;
}

async function separateVocalsAndInstrumental(inputAudioFile, options = {}) {
  const inputPath = ensureFile(inputAudioFile);
  const outputDir = path.resolve(options.outputDir || defaultOutputDirFor(inputPath));
  const modelCacheDir = path.resolve(options.modelCacheDir || path.join(projectRoot, 'storage', 'audio-separator-models'));
  const model = options.model || defaultModel;
  const outputFormat = options.outputFormat || defaultOutputFormat;
  const image = options.image || defaultImage;
  const chunkDuration = options.chunkDuration || null;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(modelCacheDir, { recursive: true });

  const inputDir = path.dirname(inputPath);
  const inputFileName = path.basename(inputPath);
  const customOutputNames = JSON.stringify({
    Vocals: 'vocals',
    Instrumental: 'instrumental',
  });

  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    dockerVolume(inputDir, '/input', 'ro'),
    '-v',
    dockerVolume(outputDir, '/output'),
    '-v',
    dockerVolume(modelCacheDir, '/models'),
    image,
    `/input/${inputFileName}`,
    '--model_filename',
    model,
    '--output_dir',
    '/output',
    '--model_file_dir',
    '/models',
    '--output_format',
    outputFormat,
    '--custom_output_names',
    customOutputNames,
  ];

  if (chunkDuration) {
    dockerArgs.push('--chunk_duration', String(chunkDuration));
  }

  await runDocker(dockerArgs, { stdio: options.stdio });

  const vocalsPath = findStemFile(outputDir, 'vocals', outputFormat);
  const instrumentalPath = findStemFile(outputDir, 'instrumental', outputFormat);

  if (!vocalsPath || !instrumentalPath) {
    throw new Error(`Separation finished, but expected stems were not found in ${outputDir}`);
  }

  return {
    vocalsPath,
    instrumentalPath,
    outputDir,
    model,
    outputFormat,
  };
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

  const result = await separateVocalsAndInstrumental(args.input, {
    outputDir: args.outputDir,
    model: args.model,
    outputFormat: args.outputFormat,
    chunkDuration: args.chunkDuration,
    image: args.image,
  });

  console.log('\nSeparation complete:');
  console.log(`  Vocals:       ${result.vocalsPath}`);
  console.log(`  Instrumental: ${result.instrumentalPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    console.error('If this failed during the first model download, remove the partial file in storage/audio-separator-models and rerun the command.');
    process.exitCode = 1;
  });
}

module.exports = {
  separateVocalsAndInstrumental,
};
