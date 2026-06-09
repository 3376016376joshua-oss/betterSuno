'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ensureFile, resolvePath } = require('./command-runner');

const projectRoot = path.resolve(__dirname, '..', '..');

function defaultVoiceProfilesDir() {
  return path.join(projectRoot, 'storage', 'voice-profiles');
}

function readJsonFile(filePath, label) {
  const resolved = ensureFile(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`);
  }
}

function resolveMaybeRelative(filePath, baseDir) {
  if (!filePath) {
    return null;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

function firstExistingFile(baseDir, candidates) {
  for (const candidate of candidates) {
    const resolved = path.resolve(baseDir, candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return null;
}

function normalizeCommandParts(value) {
  if (!value) {
    return null;
  }

  if (!Array.isArray(value) || value.some((part) => typeof part !== 'string')) {
    throw new Error('voice profile converter.command must be a JSON string array.');
  }

  return value;
}

function resolveVoiceProfile(options = {}) {
  const profileId = options.voiceProfileId || null;
  const profilesDir = resolvePath(options.voiceProfilesDir || defaultVoiceProfilesDir());

  if (!profileId) {
    return {
      profileId: null,
      profilesDir,
      profileDir: null,
      voiceModelPath: options.voiceModelPath || null,
      voiceIndexPath: options.voiceIndexPath || null,
      converterCommandParts: options.converterCommandParts || null,
      converterCommandJson: options.converterCommandJson || null,
      metadata: {},
    };
  }

  const profileDir = path.join(profilesDir, profileId);
  const explicitProfileFile = options.voiceProfileFile ? resolvePath(options.voiceProfileFile) : null;
  const profileFile = explicitProfileFile || path.join(profileDir, 'profile.json');
  const metadata = fs.existsSync(profileFile) ? readJsonFile(profileFile, 'Voice profile manifest') : {};
  const manifestBaseDir = path.dirname(profileFile);

  const manifestModelPath = resolveMaybeRelative(
    metadata.adapterPath || metadata.modelPath || metadata.voiceModelPath,
    manifestBaseDir
  );
  const manifestIndexPath = resolveMaybeRelative(metadata.indexPath || metadata.voiceIndexPath, manifestBaseDir);
  const inferredModelPath = firstExistingFile(profileDir, [
    'adapter.safetensors',
    'adapter.pt',
    'model.pth',
    `${profileId}.pth`,
  ]);
  const inferredIndexPath = firstExistingFile(profileDir, [
    'index.faiss',
    'model.index',
    `${profileId}.index`,
  ]);
  const converter = metadata.converter && typeof metadata.converter === 'object' ? metadata.converter : {};

  return {
    profileId,
    profilesDir,
    profileDir,
    voiceModelPath: options.voiceModelPath || manifestModelPath || inferredModelPath,
    voiceIndexPath: options.voiceIndexPath || manifestIndexPath || inferredIndexPath,
    converterCommandParts:
      options.converterCommandParts ||
      normalizeCommandParts(converter.command) ||
      null,
    converterCommandJson:
      options.converterCommandJson ||
      (typeof converter.commandJson === 'string' ? converter.commandJson : null),
    metadata,
  };
}

module.exports = {
  defaultVoiceProfilesDir,
  resolveVoiceProfile,
};
