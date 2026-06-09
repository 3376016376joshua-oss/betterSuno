export type SupportedLanguage = "en" | "zh" | "ja" | "ko" | "es" | "custom";

export type RemixIntent = "cover" | "parody" | "translation" | "brand_jingle" | "original_variant";

export type RightsConfirmation = {
  hasSourceRights: boolean;
  hasVoiceConsent: boolean;
  allowPlatformProcessing: boolean;
};

export type SourceAudioFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

export type RemixJobRequest = {
  sourceAudioUrl?: string;
  sourceAudioFile?: SourceAudioFile;
  voiceProfileId?: string;
  prompt: string;
  lyrics?: string;
  targetLanguage: SupportedLanguage;
  durationSeconds: number;
  intent: RemixIntent;
  keepMelodyStrength: number;
  rights: RightsConfirmation;
};

export type RemixJobStatus = "queued" | "analyzing" | "generating" | "mixing" | "completed" | "failed";

export type RemixArtifact = {
  kind: "master" | "vocals" | "instrumental" | "stems" | "waveform" | "report";
  url: string;
  mimeType: string;
};

export type RemixQualityReport = {
  melodySimilarity: number;
  lyricFit: number;
  voiceSimilarity: number;
  mixReadiness: number;
  notes: string[];
};

export type RemixJob = {
  id: string;
  status: RemixJobStatus;
  request: RemixJobRequest;
  artifacts: RemixArtifact[];
  quality?: RemixQualityReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRemixJobResponse = {
  job: RemixJob;
};

export type GetRemixJobResponse = {
  job: RemixJob;
};

export type VocalRemixJobStatus = "queued" | "separating" | "converting" | "completed" | "failed";

export type VocalRemixConverterMode = "custom" | "svc" | "rvc";

export type VocalRemixArtifactKind = "vocals" | "instrumental" | "converted-vocals";

export type VocalRemixArtifact = {
  kind: VocalRemixArtifactKind;
  url: string;
  path: string;
  mimeType: string;
};

export type VocalRemixJobRequest = {
  sourceAudioPath?: string;
  sourceAudioFile?: SourceAudioFile;
  voiceProfileId?: string;
  converterMode?: VocalRemixConverterMode;
  voiceModelPath?: string;
  voiceIndexPath?: string;
  outputDir?: string;
  convertedVocalsPath?: string;
  converterCommandJson?: string;
  converterBin?: string;
  converterArgs?: string[];
  converterCwd?: string;
  separatorModel?: string;
  separatorOutputFormat?: string;
  separatorChunkDuration?: number;
  separatorImage?: string;
  rights: RightsConfirmation;
};

export type VocalRemixConverterRun = {
  command: string;
  args: string[];
};

export type VocalRemixJob = {
  id: string;
  status: VocalRemixJobStatus;
  request: VocalRemixJobRequest;
  artifacts: VocalRemixArtifact[];
  inputAudioPath?: string;
  outputDir?: string;
  converter?: VocalRemixConverterRun;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateVocalRemixJobResponse = {
  job: VocalRemixJob;
};

export type GetVocalRemixJobResponse = {
  job: VocalRemixJob;
};
