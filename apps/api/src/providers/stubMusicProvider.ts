import type { MusicProvider } from "./types";

const nowId = () => Date.now().toString(36);

export const stubMusicProvider: MusicProvider = {
  name: "stub",
  async analyzeSource() {
    return {
      bpm: 96,
      key: "C major",
      sections: [
        { label: "verse", startSeconds: 0, endSeconds: 30 },
        { label: "hook", startSeconds: 30, endSeconds: 75 }
      ],
      melodyGuideUrl: "stub://melody-guide.mid"
    };
  },
  async generateConstrainedLyrics(input) {
    return {
      text:
        input.lyrics ??
        `Draft lyric based on prompt: ${input.prompt}. The final provider should align syllables to the melody guide.`,
      syllableMapUrl: "stub://syllable-map.json"
    };
  },
  async generateUserVocal(input) {
    return {
      audioUrl: `stub://vocals/${input.voiceProfileId ?? "demo"}-${nowId()}.wav`,
      voiceProfileId: input.voiceProfileId
    };
  },
  async mixRemix() {
    return [
      {
        kind: "master",
        url: `stub://masters/remix-${nowId()}.wav`,
        mimeType: "audio/wav"
      },
      {
        kind: "report",
        url: `stub://reports/remix-${nowId()}.json`,
        mimeType: "application/json"
      }
    ];
  },
  async scoreQuality() {
    return {
      melodySimilarity: 0.78,
      lyricFit: 0.72,
      voiceSimilarity: 0.66,
      mixReadiness: 0.7,
      notes: ["Stub score only. Connect a provider and offline evaluators before beta."]
    };
  }
};
