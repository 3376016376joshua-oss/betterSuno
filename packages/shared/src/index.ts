export type SupportedLanguage = "en" | "zh" | "ja" | "ko" | "es" | "custom";

export type RemixIntent = "cover" | "parody" | "translation" | "brand_jingle" | "original_variant";

export type RightsConfirmation = {
  hasSourceRights: boolean;
  hasVoiceConsent: boolean;
  allowPlatformProcessing: boolean;
};

export type RemixJobRequest = {
  sourceAudioUrl: string;
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
