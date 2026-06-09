import { existsSync, readdirSync, readFileSync } from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VocalRemixConverterMode, VocalRemixJobRequest } from "@better-suno/shared";
import { env } from "../config/env";

type VoiceProfileManifest = {
  id?: string;
  displayName?: string;
  converterMode?: VocalRemixConverterMode;
  engine?: VocalRemixConverterMode;
  modelPath?: string;
  indexPath?: string;
  modelUri?: string;
  indexUri?: string;
  converterCommandJson?: string;
  converterCwd?: string;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const modelCandidateNames = ["adapter.safetensors", "model.safetensors", "model.pth", "rvc.pth"];
const indexCandidateNames = ["index.faiss", "index.index", "model.index"];

export const resolveProjectPath = (value?: string, baseDir = projectRoot): string | undefined => {
  if (!value) {
    return undefined;
  }

  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(baseDir, value);
};

const voiceProfilesRoot = () => resolveProjectPath(env.VOICE_PROFILES_DIR) ?? path.join(projectRoot, "storage", "voice-profiles");

const isRemoteUri = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.startsWith("file://");

const readManifest = (profileDir: string): VoiceProfileManifest => {
  const manifestPath = path.join(profileDir, "profile.json");
  if (!existsSync(manifestPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as VoiceProfileManifest;
  } catch (error) {
    throw new Error(`Voice profile manifest is invalid JSON: ${manifestPath} (${error instanceof Error ? error.message : "unknown error"})`);
  }
};

const normalizeMode = (mode?: string): VocalRemixConverterMode | undefined => {
  if (mode === "custom" || mode === "svc" || mode === "rvc") {
    return mode;
  }

  return undefined;
};

const resolveArtifactPath = (profileDir: string, value: string | undefined, uri: string | undefined, label: string) => {
  if (value) {
    return resolveProjectPath(value, profileDir);
  }

  if (!uri) {
    return undefined;
  }

  if (uri.startsWith("file://")) {
    return resolveProjectPath(new URL(uri).pathname);
  }

  if (isRemoteUri(uri)) {
    throw new Error(`${label} uses remote URI ${uri}. Remote voice artifact download is not configured yet.`);
  }

  return resolveProjectPath(uri, profileDir);
};

const firstExisting = (profileDir: string, candidates: string[]) =>
  candidates.map((candidate) => path.join(profileDir, candidate)).find((candidate) => existsSync(candidate));

const firstByExtension = (profileDir: string, extensions: string[]) => {
  if (!existsSync(profileDir)) {
    return undefined;
  }

  return readdirSync(profileDir)
    .map((file) => path.join(profileDir, file))
    .find((filePath) => existsSync(filePath) && extensions.includes(path.extname(filePath).toLowerCase()));
};

const inferModelPath = (profileDir: string) => firstExisting(profileDir, modelCandidateNames) ?? firstByExtension(profileDir, [".safetensors", ".pth", ".onnx"]);

const inferIndexPath = (profileDir: string) => firstExisting(profileDir, indexCandidateNames) ?? firstByExtension(profileDir, [".faiss", ".index"]);

const commandForMode = (mode?: VocalRemixConverterMode) => {
  if (mode === "svc") {
    return env.SVC_CONVERTER_COMMAND_JSON;
  }

  if (mode === "rvc") {
    return env.RVC_CONVERTER_COMMAND_JSON;
  }

  return undefined;
};

const cwdForMode = (mode?: VocalRemixConverterMode) => {
  if (mode === "svc") {
    return env.SVC_CONVERTER_CWD;
  }

  if (mode === "rvc") {
    return env.RVC_CONVERTER_CWD;
  }

  return undefined;
};

const ensureExistingFile = (filePath: string | undefined, label: string) => {
  if (!filePath) {
    return undefined;
  }

  if (!existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  return filePath;
};

export const resolveVocalRemixRequest = (request: VocalRemixJobRequest): VocalRemixJobRequest => {
  const profileId = request.voiceProfileId;
  const profileDir = profileId ? path.join(voiceProfilesRoot(), profileId) : undefined;
  const manifest = profileDir && existsSync(profileDir) ? readManifest(profileDir) : {};
  const manifestMode = normalizeMode(manifest.converterMode ?? manifest.engine);
  const converterMode = request.converterMode ?? manifestMode ?? "custom";
  const modelPath =
    resolveProjectPath(request.voiceModelPath) ??
    (profileDir ? resolveArtifactPath(profileDir, manifest.modelPath, manifest.modelUri, "Voice model") : undefined) ??
    (profileDir ? inferModelPath(profileDir) : undefined);
  const indexPath =
    resolveProjectPath(request.voiceIndexPath) ??
    (profileDir ? resolveArtifactPath(profileDir, manifest.indexPath, manifest.indexUri, "Voice index") : undefined) ??
    (profileDir ? inferIndexPath(profileDir) : undefined);
  const converterCommandJson = request.converterCommandJson ?? manifest.converterCommandJson ?? commandForMode(converterMode);
  const converterCwd = request.converterCwd ?? manifest.converterCwd ?? cwdForMode(converterMode);

  if (profileId && !profileDir) {
    throw new Error(`Voice profile id is invalid: ${profileId}`);
  }

  if (profileId && !existsSync(profileDir!)) {
    throw new Error(`Voice profile not found: ${profileDir}`);
  }

  if ((converterMode === "svc" || converterMode === "rvc") && !converterCommandJson) {
    throw new Error(`No ${converterMode.toUpperCase()} converter command configured.`);
  }

  return {
    ...request,
    converterMode,
    voiceModelPath: ensureExistingFile(modelPath, "Voice model"),
    voiceIndexPath: ensureExistingFile(indexPath, "Voice index"),
    converterCommandJson,
    converterCwd
  };
};
