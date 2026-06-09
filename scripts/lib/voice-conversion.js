'use strict';

const path = require('node:path');

const {
  ensureDirectory,
  ensureFile,
  ensureNonEmptyFile,
  resolvePath,
  runCommand,
} = require('./command-runner');

const PLACEHOLDERS = new Set([
  'input',
  'output',
  'voiceProfileId',
  'voiceModel',
  'voiceIndex',
  'workDir',
]);

function replacePlaceholders(value, variables) {
  return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!PLACEHOLDERS.has(key)) {
      throw new Error(`Unknown voice conversion placeholder: ${match}`);
    }

    const replacement = variables[key];
    return replacement == null ? '' : String(replacement);
  });
}

function parseCommandJson(commandJson) {
  if (!commandJson) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(commandJson);
  } catch (error) {
    throw new Error(`Voice converter command must be a JSON array: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string')) {
    throw new Error('Voice converter command must be a non-empty JSON string array.');
  }

  return parsed;
}

function commandPartsFromOptions(options) {
  if (options.commandParts?.length) {
    return options.commandParts;
  }

  const commandJson = options.commandJson || process.env.VOICE_CONVERTER_COMMAND_JSON;
  const parsedCommand = parseCommandJson(commandJson);

  if (parsedCommand) {
    return parsedCommand;
  }

  if (options.commandBin || process.env.VOICE_CONVERTER_BIN) {
    return [
      options.commandBin || process.env.VOICE_CONVERTER_BIN,
      ...(options.commandArgs || []),
    ];
  }

  throw new Error(
    'No voice converter command configured. Pass --converter-command-json, --converter-bin/--converter-arg, or set VOICE_CONVERTER_COMMAND_JSON.'
  );
}

function buildConverterCommand(options, variables) {
  const parts = commandPartsFromOptions(options).map((part) => replacePlaceholders(part, variables));
  const [command, ...args] = parts;

  if (!command) {
    throw new Error('Voice converter command resolved to an empty executable.');
  }

  return {
    command,
    args,
  };
}

async function convertVocalsWithCommand(inputVocalsFile, options = {}) {
  const inputPath = ensureNonEmptyFile(inputVocalsFile, 'Input vocals file');
  const outputPath = resolvePath(options.outputPath || path.join(process.cwd(), 'converted-vocals.wav'));
  const workDir = ensureDirectory(options.workDir || path.dirname(outputPath));

  if (options.voiceModelPath) {
    ensureFile(options.voiceModelPath, 'Voice model');
  }

  if (options.voiceIndexPath) {
    ensureFile(options.voiceIndexPath, 'Voice index');
  }

  const variables = {
    input: inputPath,
    output: outputPath,
    voiceProfileId: options.voiceProfileId || '',
    voiceModel: options.voiceModelPath ? resolvePath(options.voiceModelPath) : '',
    voiceIndex: options.voiceIndexPath ? resolvePath(options.voiceIndexPath) : '',
    workDir,
  };

  const { command, args } = buildConverterCommand(options, variables);

  await runCommand(command, args, {
    cwd: options.cwd || workDir,
    env: options.env,
    label: 'voice converter',
    stdio: options.stdio,
  });

  return {
    convertedVocalsPath: ensureNonEmptyFile(outputPath, 'Converted vocals file'),
    converter: {
      command,
      args,
    },
  };
}

module.exports = {
  buildConverterCommand,
  convertVocalsWithCommand,
  parseCommandJson,
  replacePlaceholders,
};
