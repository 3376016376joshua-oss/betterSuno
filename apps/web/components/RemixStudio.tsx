"use client";

import {
  FileAudio2,
  Mic2,
  Music2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  TerminalSquare,
  WandSparkles
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  RemixArtifact,
  RemixJob,
  RemixJobRequest,
  SourceAudioFile,
  VocalRemixArtifact,
  VocalRemixJob,
  VocalRemixJobRequest
} from "@better-suno/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const providerLabel = process.env.NEXT_PUBLIC_MUSIC_PROVIDER ?? "Mureka";

type StudioView = "remix" | "vocal-remix";
type DisplayArtifact = RemixArtifact | VocalRemixArtifact;

const defaultRequest: RemixJobRequest = {
  sourceAudioUrl: "",
  voiceProfileId: "demo-user-voice",
  prompt: "Create a hopeful hook with a strong melodic memory and fresh lyrics.",
  targetLanguage: "en",
  durationSeconds: 60,
  intent: "cover",
  keepMelodyStrength: 0.82,
  rights: {
    hasSourceRights: true,
    hasVoiceConsent: true,
    allowPlatformProcessing: true
  }
};

const defaultVocalRequest: VocalRemixJobRequest = {
  sourceAudioPath: "./source.mp3",
  voiceProfileId: "demo",
  converterMode: "custom",
  voiceModelPath: "./storage/voice-profiles/demo/adapter.safetensors",
  converterCommandJson:
    '["python","/path/to/svc/infer.py","--input","{input}","--output","{output}","--model","{voiceModel}"]',
  guideLyrics: "",
  originalLyrics: "",
  generateLyricsAlignment: false,
  lyricsAlignmentProvider: "auto",
  lyricsAlignmentLanguage: "auto",
  mfaDictionary: "",
  mfaAcousticModel: "",
  whisperxDevice: "cpu",
  whisperxComputeType: "int8",
  vocalGuideLanguage: "auto",
  extractRhythm: false,
  rhythmBeatSource: "vocals",
  separatorOutputFormat: "WAV",
  rights: {
    hasSourceRights: true,
    hasVoiceConsent: true,
    allowPlatformProcessing: true
  }
};

export function RemixStudio() {
  const [activeView, setActiveView] = useState<StudioView>("remix");

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <div className="brand-lockup">
          <Music2 aria-hidden="true" />
          <span>BetterSuno</span>
        </div>

        <nav className="nav-stack" aria-label="Studio views">
          <button
            className={`nav-item ${activeView === "remix" ? "active" : ""}`}
            type="button"
            aria-current={activeView === "remix" ? "page" : undefined}
            onClick={() => setActiveView("remix")}
          >
            <WandSparkles aria-hidden="true" />
            <span>Remix</span>
          </button>
          <button
            className={`nav-item ${activeView === "vocal-remix" ? "active" : ""}`}
            type="button"
            aria-current={activeView === "vocal-remix" ? "page" : undefined}
            onClick={() => setActiveView("vocal-remix")}
          >
            <Mic2 aria-hidden="true" />
            <span>V1 Vocals</span>
          </button>
        </nav>
      </aside>

      <section className="studio-main">
        {activeView === "remix" ? <RemixWorkspace /> : <VocalRemixWorkspace />}
      </section>
    </main>
  );
}

function RemixWorkspace() {
  const [request, setRequest] = useState<RemixJobRequest>(defaultRequest);
  const [lyrics, setLyrics] = useState(
    "City lights are calling me home\nWe keep the rhythm moving on\nEvery night we find our own\nA little spark before the dawn"
  );
  const [sourceAudioFile, setSourceAudioFile] = useState<File | null>(null);
  const [job, setJob] = useState<RemixJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSourceInput = Boolean(sourceAudioFile || request.sourceAudioUrl?.trim());
  const canSubmit =
    request.rights.hasSourceRights &&
    request.rights.hasVoiceConsent &&
    request.rights.allowPlatformProcessing &&
    hasSourceInput &&
    lyrics.trim().length > 0;

  const qualityAverage = useMemo(() => {
    if (!job?.quality) {
      return null;
    }

    const { melodySimilarity, lyricFit, voiceSimilarity, mixReadiness } = job.quality;
    return Math.round(((melodySimilarity + lyricFit + voiceSimilarity + mixReadiness) / 4) * 100);
  }, [job]);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const sourceAudioPayload = sourceAudioFile ? await readSourceAudioFile(sourceAudioFile) : undefined;
      const response = await fetch(`${apiBaseUrl}/v1/remix/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...request,
          sourceAudioUrl: optionalString(request.sourceAudioUrl),
          lyrics: lyrics.trim(),
          sourceAudioFile: sourceAudioPayload
        })
      });

      await requireOk(response);

      const data = (await response.json()) as { job: RemixJob };
      setJob(data.job);
      window.setTimeout(() => refreshJob(data.job.id), 350);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create remix job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshJob = async (jobId = job?.id) => {
    if (!jobId) {
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/remix/jobs/${jobId}`);
    await requireOk(response);

    const data = (await response.json()) as { job: RemixJob };
    setJob(data.job);

    if (["queued", "analyzing", "generating", "mixing"].includes(data.job.status)) {
      window.setTimeout(() => refreshJob(jobId), 650);
    }
  };

  return (
    <>
      <header className="studio-header">
        <div>
          <p className="eyebrow">Authorized remix studio</p>
          <h1>Build a melody-stable voice remix</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => refreshJob()} title="Refresh job">
          <RefreshCw aria-hidden="true" />
        </button>
      </header>

      <div className="workspace-grid">
        <section className="control-panel" aria-label="Remix controls">
          <label>
            <span>Source audio file</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                setSourceAudioFile(event.target.files?.[0] ?? null);
              }}
            />
            <small>{sourceAudioFile ? sourceAudioFile.name : "Select an authorized audio file to remix."}</small>
          </label>

          <label>
            <span>Source audio URL</span>
            <input
              value={request.sourceAudioUrl}
              onChange={(event) => setRequest({ ...request, sourceAudioUrl: event.target.value })}
              placeholder="https://example.com/authorized-song.mp3"
            />
          </label>

          <label>
            <span>Voice profile</span>
            <input
              value={request.voiceProfileId ?? ""}
              onChange={(event) => setRequest({ ...request, voiceProfileId: event.target.value })}
            />
          </label>

          <label>
            <span>Creative prompt</span>
            <textarea
              rows={5}
              value={request.prompt}
              onChange={(event) => setRequest({ ...request, prompt: event.target.value })}
            />
          </label>

          <label>
            <span>Lyrics</span>
            <textarea
              rows={7}
              value={lyrics}
              onChange={(event) => setLyrics(event.target.value)}
              placeholder="Write the lyrics you want the remix to sing."
            />
          </label>

          <div className="split-row">
            <label>
              <span>Duration</span>
              <input
                type="number"
                min={15}
                max={90}
                value={request.durationSeconds}
                onChange={(event) => setRequest({ ...request, durationSeconds: Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Language</span>
              <select
                value={request.targetLanguage}
                onChange={(event) =>
                  setRequest({ ...request, targetLanguage: event.target.value as RemixJobRequest["targetLanguage"] })
                }
              >
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="es">Spanish</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>

          <label>
            <span>Melody lock</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={request.keepMelodyStrength}
              onChange={(event) => setRequest({ ...request, keepMelodyStrength: Number(event.target.value) })}
            />
          </label>

          <RightsStrip
            rights={request.rights}
            onChange={(rights) => {
              setRequest({ ...request, rights });
            }}
          />

          <button className="primary-action" type="button" onClick={submit} disabled={isSubmitting || !canSubmit}>
            <Play aria-hidden="true" />
            <span>{isSubmitting ? "Queued" : "Generate remix"}</span>
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="result-panel" aria-label="Remix results">
          <WaveformSurface />

          <div className="status-grid">
            <StatusCell label="Job" value={job?.id.slice(0, 8) ?? "None"} />
            <StatusCell label="State" value={job?.status ?? "Ready"} />
            <StatusCell label="Quality" value={qualityAverage !== null ? `${qualityAverage}%` : "Pending"} />
            <StatusCell label="Provider" value={providerLabel} />
          </div>

          <ArtifactList artifacts={job?.artifacts ?? []} />
        </section>
      </div>
    </>
  );
}

function VocalRemixWorkspace() {
  const [request, setRequest] = useState<VocalRemixJobRequest>(defaultVocalRequest);
  const [sourceAudioFile, setSourceAudioFile] = useState<File | null>(null);
  const [job, setJob] = useState<VocalRemixJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSourceInput = Boolean(sourceAudioFile || request.sourceAudioPath?.trim());
  const hasConverter = Boolean(
    request.converterMode === "svc" ||
      request.converterMode === "rvc" ||
      request.converterCommandJson?.trim() ||
      request.converterBin?.trim()
  );
  const canSubmit =
    request.rights.hasSourceRights &&
    request.rights.hasVoiceConsent &&
    request.rights.allowPlatformProcessing &&
    hasSourceInput &&
    hasConverter;

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const sourceAudioPayload = sourceAudioFile ? await readSourceAudioFile(sourceAudioFile) : undefined;
      const response = await fetch(`${apiBaseUrl}/v1/remix/vocals/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...request,
          sourceAudioPath: sourceAudioFile ? undefined : optionalString(request.sourceAudioPath),
          sourceAudioFile: sourceAudioPayload,
          voiceProfileId: optionalString(request.voiceProfileId),
          converterMode: request.converterMode,
          voiceModelPath: optionalString(request.voiceModelPath),
          outputDir: optionalString(request.outputDir),
          originalLyrics: optionalString(request.originalLyrics),
          originalLyricsPath: optionalString(request.originalLyricsPath),
          generateLyricsAlignment: request.generateLyricsAlignment,
          lyricsAlignmentProvider: request.lyricsAlignmentProvider,
          lyricsAlignmentPath: optionalString(request.lyricsAlignmentPath),
          lyricsAlignmentTextGridPath: optionalString(request.lyricsAlignmentTextGridPath),
          lyricsAlignmentLanguage: optionalString(request.lyricsAlignmentLanguage),
          lyricsAlignmentPythonBin: optionalString(request.lyricsAlignmentPythonBin),
          requireLyricsAlignmentPhones: request.requireLyricsAlignmentPhones,
          mfaBin: optionalString(request.mfaBin),
          mfaDictionary: optionalString(request.mfaDictionary),
          mfaDictionaryPath: optionalString(request.mfaDictionaryPath),
          mfaAcousticModel: optionalString(request.mfaAcousticModel),
          mfaAcousticModelPath: optionalString(request.mfaAcousticModelPath),
          whisperxBin: optionalString(request.whisperxBin),
          whisperxModel: optionalString(request.whisperxModel),
          whisperxDevice: optionalString(request.whisperxDevice),
          whisperxComputeType: optionalString(request.whisperxComputeType),
          whisperxBatchSize: request.whisperxBatchSize,
          guideLyrics: optionalString(request.guideLyrics),
          guideLyricsPath: optionalString(request.guideLyricsPath),
          vocalGuidePath: optionalString(request.vocalGuidePath),
          vocalGuideLanguage: optionalString(request.vocalGuideLanguage),
          vocalGuideMaxMismatchRatio: request.vocalGuideMaxMismatchRatio,
          requireVocalGuideMatch: request.requireVocalGuideMatch,
          generateVocalGuide: request.generateVocalGuide,
          extractRhythm: request.extractRhythm,
          rhythmPath: optionalString(request.rhythmPath),
          rhythmBeatSource: request.rhythmBeatSource,
          rhythmSampleRate: request.rhythmSampleRate,
          rhythmHopLength: request.rhythmHopLength,
          converterCommandJson: optionalString(request.converterCommandJson),
          converterCwd: optionalString(request.converterCwd),
          separatorModel: optionalString(request.separatorModel),
          separatorOutputFormat: optionalString(request.separatorOutputFormat),
          separatorImage: optionalString(request.separatorImage)
        })
      });

      await requireOk(response);

      const data = (await response.json()) as { job: VocalRemixJob };
      setJob(data.job);
      window.setTimeout(() => refreshJob(data.job.id), 500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create vocal remix job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshJob = async (jobId = job?.id) => {
    if (!jobId) {
      return;
    }

    const response = await fetch(`${apiBaseUrl}/v1/remix/vocals/jobs/${jobId}`);
    await requireOk(response);

    const data = (await response.json()) as { job: VocalRemixJob };
    setJob(data.job);

    if (["queued", "separating", "aligning", "analyzing", "guiding", "converting"].includes(data.job.status)) {
      window.setTimeout(() => refreshJob(jobId), 900);
    }
  };

  return (
    <>
      <header className="studio-header">
        <div>
          <p className="eyebrow">Singing voice conversion</p>
          <h1>Run the V1 vocal remix pipeline</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => refreshJob()} title="Refresh job">
          <RefreshCw aria-hidden="true" />
        </button>
      </header>

      <div className="workspace-grid">
        <section className="control-panel" aria-label="V1 vocal remix controls">
          <label>
            <span>Source audio file</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                setSourceAudioFile(event.target.files?.[0] ?? null);
              }}
            />
            <small>{sourceAudioFile ? sourceAudioFile.name : "Uses the server-side source path when empty."}</small>
          </label>

          <label>
            <span>Source audio path</span>
            <input
              value={request.sourceAudioPath ?? ""}
              onChange={(event) => setRequest({ ...request, sourceAudioPath: event.target.value })}
              placeholder="./source.mp3"
            />
          </label>

          <label>
            <span>Voice profile</span>
            <input
              value={request.voiceProfileId ?? ""}
              onChange={(event) => setRequest({ ...request, voiceProfileId: event.target.value })}
              placeholder="demo"
            />
          </label>

          <label>
            <span>Converter mode</span>
            <select
              value={request.converterMode ?? "custom"}
              onChange={(event) =>
                setRequest({
                  ...request,
                  converterMode: event.target.value as VocalRemixJobRequest["converterMode"]
                })
              }
            >
              <option value="custom">Custom JSON</option>
              <option value="svc">SVC</option>
              <option value="rvc">RVC</option>
            </select>
          </label>

          <label>
            <span>Voice model</span>
            <input
              value={request.voiceModelPath ?? ""}
              onChange={(event) => setRequest({ ...request, voiceModelPath: event.target.value })}
              placeholder="./storage/voice-profiles/demo/adapter.safetensors"
            />
          </label>

          <label>
            <span>Converter command JSON</span>
            <textarea
              rows={6}
              value={request.converterCommandJson ?? ""}
              onChange={(event) => setRequest({ ...request, converterCommandJson: event.target.value })}
            />
          </label>

          <label>
            <span>Replacement lyrics</span>
            <textarea
              rows={5}
              value={request.guideLyrics ?? ""}
              onChange={(event) => setRequest({ ...request, guideLyrics: event.target.value })}
            />
          </label>

          <label>
            <span>Original lyrics</span>
            <textarea
              rows={5}
              value={request.originalLyrics ?? ""}
              onChange={(event) => setRequest({ ...request, originalLyrics: event.target.value })}
            />
          </label>

          <div className="rights-strip">
            <label>
              <input
                type="checkbox"
                checked={Boolean(request.generateLyricsAlignment)}
                onChange={(event) => setRequest({ ...request, generateLyricsAlignment: event.target.checked })}
              />
              <span>Lyrics alignment</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(request.extractRhythm)}
                onChange={(event) => setRequest({ ...request, extractRhythm: event.target.checked })}
              />
              <span>Extract rhythm</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(request.generateVocalGuide)}
                onChange={(event) => setRequest({ ...request, generateVocalGuide: event.target.checked })}
              />
              <span>Vocal guide</span>
            </label>
          </div>

          <div className="split-row">
            <label>
              <span>Alignment provider</span>
              <select
                value={request.lyricsAlignmentProvider ?? "auto"}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    lyricsAlignmentProvider: event.target.value as VocalRemixJobRequest["lyricsAlignmentProvider"]
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="mfa">MFA</option>
                <option value="whisperx">WhisperX</option>
                <option value="whisperx-mfa">WhisperX + MFA</option>
              </select>
            </label>

            <label>
              <span>Alignment language</span>
              <input
                value={request.lyricsAlignmentLanguage ?? "auto"}
                onChange={(event) => setRequest({ ...request, lyricsAlignmentLanguage: event.target.value })}
                placeholder="auto"
              />
            </label>
          </div>

          <div className="split-row">
            <label>
              <span>MFA dictionary</span>
              <input
                value={request.mfaDictionary ?? ""}
                onChange={(event) => setRequest({ ...request, mfaDictionary: event.target.value })}
                placeholder="english_us_arpa"
              />
            </label>

            <label>
              <span>MFA acoustic</span>
              <input
                value={request.mfaAcousticModel ?? ""}
                onChange={(event) => setRequest({ ...request, mfaAcousticModel: event.target.value })}
                placeholder="english_us_arpa"
              />
            </label>
          </div>

          <div className="split-row">
            <label>
              <span>Guide language</span>
              <input
                value={request.vocalGuideLanguage ?? "auto"}
                onChange={(event) => setRequest({ ...request, vocalGuideLanguage: event.target.value })}
                placeholder="auto"
              />
            </label>

            <label>
              <span>Guide tolerance</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={request.vocalGuideMaxMismatchRatio ?? 0.2}
                onChange={(event) =>
                  setRequest({ ...request, vocalGuideMaxMismatchRatio: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <label>
            <span>Output directory</span>
            <input
              value={request.outputDir ?? ""}
              onChange={(event) => setRequest({ ...request, outputDir: event.target.value })}
              placeholder="storage/remix-v1-vocals/jobs/custom"
            />
          </label>

          <div className="split-row">
            <label>
              <span>Rhythm source</span>
              <select
                value={request.rhythmBeatSource ?? "vocals"}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    rhythmBeatSource: event.target.value as VocalRemixJobRequest["rhythmBeatSource"]
                  })
                }
              >
                <option value="vocals">Vocals</option>
                <option value="instrumental">Instrumental</option>
                <option value="mix">Mix</option>
                <option value="auto">Auto</option>
              </select>
            </label>

            <label>
              <span>Rhythm output</span>
              <input
                value={request.rhythmPath ?? ""}
                onChange={(event) => setRequest({ ...request, rhythmPath: event.target.value })}
                placeholder="storage/remix-v1-vocals/jobs/custom/rhythm/rhythm.json"
              />
            </label>
          </div>

          <label>
            <span>Converter cwd</span>
            <input
              value={request.converterCwd ?? ""}
              onChange={(event) => setRequest({ ...request, converterCwd: event.target.value })}
              placeholder="/path/to/svc"
            />
          </label>

          <label>
            <span>Separator model</span>
            <input
              value={request.separatorModel ?? ""}
              onChange={(event) => setRequest({ ...request, separatorModel: event.target.value })}
              placeholder="UVR-MDX-NET-Inst_HQ_3.onnx"
            />
          </label>

          <label>
            <span>Separator format</span>
            <select
              value={request.separatorOutputFormat ?? "WAV"}
              onChange={(event) => setRequest({ ...request, separatorOutputFormat: event.target.value })}
            >
              <option value="WAV">WAV</option>
              <option value="MP3">MP3</option>
              <option value="FLAC">FLAC</option>
            </select>
          </label>

          <RightsStrip
            rights={request.rights}
            onChange={(rights) => {
              setRequest({ ...request, rights });
            }}
          />

          <button className="primary-action" type="button" onClick={submit} disabled={isSubmitting || !canSubmit}>
            <FileAudio2 aria-hidden="true" />
            <span>{isSubmitting ? "Queued" : "Run V1 vocals"}</span>
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="result-panel" aria-label="V1 vocal remix results">
          <WaveformSurface />

          <div className="status-grid">
            <StatusCell label="Job" value={job?.id.slice(0, 8) ?? "None"} />
            <StatusCell label="State" value={job?.status ?? "Ready"} />
            <StatusCell label="Voice" value={job?.request.voiceProfileId ?? request.voiceProfileId ?? "None"} />
            <StatusCell label="Output" value={job?.outputDir ? "Created" : "Pending"} />
          </div>

          <ArtifactList artifacts={job?.artifacts ?? []} />

          {job?.vocalGuide ? (
            <div className="command-box">
              <div className="section-title">
                <SlidersHorizontal aria-hidden="true" />
                <span>Vocal guide</span>
              </div>
              <code>
                {job.vocalGuide.fit.status} - {job.vocalGuide.lyricSyllableCount}/{job.vocalGuide.slotCount} syllables
              </code>
            </div>
          ) : null}

          {job?.rhythm ? (
            <div className="command-box">
              <div className="section-title">
                <SlidersHorizontal aria-hidden="true" />
                <span>Rhythm</span>
              </div>
              <code>
                {job.rhythm.tempoBpm ?? "unknown"} BPM - {job.rhythm.beatCount} beats -{" "}
                {job.rhythm.phraseCount} phrases
              </code>
            </div>
          ) : null}

          {job?.lyricsAlignment ? (
            <div className="command-box">
              <div className="section-title">
                <SlidersHorizontal aria-hidden="true" />
                <span>Lyrics alignment</span>
              </div>
              <code>
                {job.lyricsAlignment.provider ?? "unknown"} - {job.lyricsAlignment.wordCount} words -{" "}
                {job.lyricsAlignment.phoneCount} phones
              </code>
            </div>
          ) : null}

          {job?.converter ? (
            <div className="command-box">
              <div className="section-title">
                <TerminalSquare aria-hidden="true" />
                <span>Converter</span>
              </div>
              <code>{[job.converter.command, ...job.converter.args].join(" ")}</code>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}

function RightsStrip({
  rights,
  onChange
}: {
  rights: RemixJobRequest["rights"];
  onChange: (rights: RemixJobRequest["rights"]) => void;
}) {
  return (
    <div className="rights-strip">
      <label>
        <input
          type="checkbox"
          checked={rights.hasSourceRights}
          onChange={(event) => onChange({ ...rights, hasSourceRights: event.target.checked })}
        />
        <span>Source cleared</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={rights.hasVoiceConsent}
          onChange={(event) => onChange({ ...rights, hasVoiceConsent: event.target.checked })}
        />
        <span>Voice approved</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={rights.allowPlatformProcessing}
          onChange={(event) => onChange({ ...rights, allowPlatformProcessing: event.target.checked })}
        />
        <span>Processing approved</span>
      </label>
    </div>
  );
}

function WaveformSurface() {
  return (
    <div className="waveform-surface">
      <div className="wave-line short" />
      <div className="wave-line tall" />
      <div className="wave-line mid" />
      <div className="wave-line peak" />
      <div className="wave-line mid" />
      <div className="wave-line tall" />
      <div className="wave-line short" />
    </div>
  );
}

function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ArtifactList({ artifacts }: { artifacts: DisplayArtifact[] }) {
  return (
    <div className="artifact-list">
      <div className="section-title">
        <SlidersHorizontal aria-hidden="true" />
        <span>Artifacts</span>
      </div>
      {artifacts.length ? (
        artifacts.map((artifact) => {
          const href = artifactHref(artifact.url);

          return (
            <div className="artifact-row" key={`${artifact.kind}-${artifact.url}`}>
              <span>{artifact.kind}</span>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {("path" in artifact && artifact.path) || artifact.url}
                </a>
              ) : (
                <code>{artifact.url}</code>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty-state">No generated files yet</div>
      )}
    </div>
  );
}

async function readSourceAudioFile(file: File): Promise<SourceAudioFile> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio file."));
    reader.readAsDataURL(file);
  });

  return {
    filename: file.name,
    mimeType: file.type || "audio/mpeg",
    base64
  };
}

function optionalString(value?: string) {
  return value?.trim() || undefined;
}

function artifactHref(url: string) {
  if (url.startsWith("/")) {
    return `${apiBaseUrl}${url}`;
  }

  return url.startsWith("http://") || url.startsWith("https://") ? url : null;
}

async function requireOk(response: Response) {
  if (response.ok) {
    return;
  }

  let message = `API returned ${response.status}`;

  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    // Keep the status fallback when the API response is not JSON.
  }

  throw new Error(message);
}
