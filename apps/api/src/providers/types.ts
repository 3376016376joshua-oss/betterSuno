import type { RemixArtifact, RemixJobRequest, RemixQualityReport } from "@better-suno/shared";

export type SourceAnalysis = {
  bpm?: number;
  key?: string;
  sections: Array<{
    label: string;
    startSeconds: number;
    endSeconds: number;
  }>;
  melodyGuideUrl?: string;
  providerData?: Record<string, unknown>;
};

export type GeneratedLyrics = {
  text: string;
  syllableMapUrl?: string;
};

export type GeneratedVocal = {
  audioUrl: string;
  voiceProfileId?: string;
};

export type MusicProvider = {
  name: string;
  analyzeSource(input: RemixJobRequest): Promise<SourceAnalysis>;
  generateConstrainedLyrics(input: RemixJobRequest, analysis: SourceAnalysis): Promise<GeneratedLyrics>;
  generateUserVocal(input: RemixJobRequest, lyrics: GeneratedLyrics, analysis: SourceAnalysis): Promise<GeneratedVocal>;
  mixRemix(
    input: RemixJobRequest,
    vocal: GeneratedVocal,
    analysis: SourceAnalysis,
    lyrics: GeneratedLyrics
  ): Promise<RemixArtifact[]>;
  scoreQuality(input: RemixJobRequest, artifacts: RemixArtifact[]): Promise<RemixQualityReport>;
};
