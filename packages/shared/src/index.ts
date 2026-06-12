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

export type VocalRemixJobStatus =
  | "queued"
  | "separating"
  | "aligning"
  | "analyzing"
  | "guiding"
  | "converting"
  | "completed"
  | "failed";

export type VocalRemixConverterMode = "custom" | "svc" | "rvc";

export type RhythmBeatSource = "vocals" | "instrumental" | "mix" | "auto";

export type VocalRemixArtifactKind =
  | "vocals"
  | "instrumental"
  | "converted-vocals"
  | "lyrics-alignment"
  | "lyrics-alignment-textgrid"
  | "rhythm"
  | "vocal-guide"
  | "melody-midi"
  | "alignment-json"
  | "alignment-textgrid"
  | "syllable-map";

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
  originalLyrics?: string;
  originalLyricsPath?: string;
  generateLyricsAlignment?: boolean;
  lyricsAlignmentProvider?: "auto" | "mfa" | "whisperx" | "whisperx-mfa";
  lyricsAlignmentPath?: string;
  lyricsAlignmentTextGridPath?: string;
  lyricsAlignmentLanguage?: string;
  lyricsAlignmentPythonBin?: string;
  requireLyricsAlignmentPhones?: boolean;
  mfaBin?: string;
  mfaDictionary?: string;
  mfaDictionaryPath?: string;
  mfaAcousticModel?: string;
  mfaAcousticModelPath?: string;
  whisperxBin?: string;
  whisperxModel?: string;
  whisperxDevice?: string;
  whisperxComputeType?: string;
  whisperxBatchSize?: number;
  guideLyrics?: string;
  guideLyricsPath?: string;
  vocalGuidePath?: string;
  melodyMidiPath?: string;
  alignmentJsonPath?: string;
  alignmentTextGridPath?: string;
  syllableMapPath?: string;
  vocalGuideLanguage?: string;
  vocalGuidePythonBin?: string;
  vocalGuideMaxMismatchRatio?: number;
  requireVocalGuideMatch?: boolean;
  generateVocalGuide?: boolean;
  extractRhythm?: boolean;
  rhythmPath?: string;
  rhythmPythonBin?: string;
  rhythmBeatSource?: RhythmBeatSource;
  rhythmSampleRate?: number;
  rhythmHopLength?: number;
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

export type VocalGuideFit = {
  status: "no_lyrics" | "match" | "near" | "overfull" | "underfull";
  isAcceptable: boolean;
  slotCount: number;
  lyricSyllableCount: number;
  difference: number;
  mismatchRatio: number;
  maxMismatchRatio: number;
  warnings: string[];
};

export type VocalGuideSummary = {
  path: string;
  phraseCount: number;
  slotCount: number;
  lyricSyllableCount: number;
  fit: VocalGuideFit;
};

export type LyricsAlignmentSummary = {
  path: string;
  textGridPath?: string;
  provider?: string | null;
  transcriptSource?: string | null;
  wordCount: number;
  phoneCount: number;
  hasPhoneTimestamps: boolean;
  warnings: string[];
};

export type RhythmSummary = {
  path: string;
  tempoBpm?: number | null;
  beatCount: number;
  phraseCount: number;
  vocalOnsetCount: number;
  syllableCandidateCount: number;
  beatSource?: string | null;
  warnings: string[];
};

export type VocalRemixJob = {
  id: string;
  status: VocalRemixJobStatus;
  request: VocalRemixJobRequest;
  artifacts: VocalRemixArtifact[];
  inputAudioPath?: string;
  outputDir?: string;
  converter?: VocalRemixConverterRun;
  lyricsAlignment?: LyricsAlignmentSummary;
  rhythm?: RhythmSummary;
  vocalGuide?: VocalGuideSummary;
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
