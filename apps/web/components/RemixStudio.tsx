"use client";

import { Mic2, Music2, Play, RefreshCw, ShieldCheck, SlidersHorizontal, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { RemixJob, RemixJobRequest } from "@better-suno/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const providerLabel = process.env.NEXT_PUBLIC_MUSIC_PROVIDER ?? "Mureka";

const defaultRequest: RemixJobRequest = {
  sourceAudioUrl: "https://example.com/authorized-song.mp3",
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

export function RemixStudio() {
  const [request, setRequest] = useState<RemixJobRequest>(defaultRequest);
  const [job, setJob] = useState<RemixJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit =
    request.rights.hasSourceRights && request.rights.hasVoiceConsent && request.rights.allowPlatformProcessing;

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
      const response = await fetch(`${apiBaseUrl}/v1/remix/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

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
    const data = (await response.json()) as { job: RemixJob };
    setJob(data.job);

    if (["queued", "analyzing", "generating", "mixing"].includes(data.job.status)) {
      window.setTimeout(() => refreshJob(jobId), 650);
    }
  };

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <div className="brand-lockup">
          <Music2 aria-hidden="true" />
          <span>BetterSuno</span>
        </div>

        <nav className="nav-stack" aria-label="Studio views">
          <button className="nav-item active" type="button">
            <WandSparkles aria-hidden="true" />
            <span>Remix</span>
          </button>
          <button className="nav-item" type="button">
            <Mic2 aria-hidden="true" />
            <span>Voices</span>
          </button>
          <button className="nav-item" type="button">
            <ShieldCheck aria-hidden="true" />
            <span>Rights</span>
          </button>
        </nav>
      </aside>

      <section className="studio-main">
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
              <span>Source audio URL</span>
              <input
                value={request.sourceAudioUrl}
                onChange={(event) => setRequest({ ...request, sourceAudioUrl: event.target.value })}
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
                  onChange={(event) => setRequest({ ...request, targetLanguage: event.target.value as RemixJobRequest["targetLanguage"] })}
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

            <div className="rights-strip">
              <label>
                <input
                  type="checkbox"
                  checked={request.rights.hasSourceRights}
                  onChange={(event) =>
                    setRequest({ ...request, rights: { ...request.rights, hasSourceRights: event.target.checked } })
                  }
                />
                <span>Source cleared</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={request.rights.hasVoiceConsent}
                  onChange={(event) =>
                    setRequest({ ...request, rights: { ...request.rights, hasVoiceConsent: event.target.checked } })
                  }
                />
                <span>Voice approved</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={request.rights.allowPlatformProcessing}
                  onChange={(event) =>
                    setRequest({
                      ...request,
                      rights: { ...request.rights, allowPlatformProcessing: event.target.checked }
                    })
                  }
                />
                <span>Processing approved</span>
              </label>
            </div>

            <button className="primary-action" type="button" onClick={submit} disabled={isSubmitting || !canSubmit}>
              <Play aria-hidden="true" />
              <span>{isSubmitting ? "Queued" : "Generate remix"}</span>
            </button>

            {error ? <p className="error-text">{error}</p> : null}
          </section>

          <section className="result-panel" aria-label="Remix results">
            <div className="waveform-surface">
              <div className="wave-line short" />
              <div className="wave-line tall" />
              <div className="wave-line mid" />
              <div className="wave-line peak" />
              <div className="wave-line mid" />
              <div className="wave-line tall" />
              <div className="wave-line short" />
            </div>

            <div className="status-grid">
              <StatusCell label="Job" value={job?.id.slice(0, 8) ?? "None"} />
              <StatusCell label="State" value={job?.status ?? "Ready"} />
              <StatusCell label="Quality" value={qualityAverage !== null ? `${qualityAverage}%` : "Pending"} />
              <StatusCell label="Provider" value={providerLabel} />
            </div>

            <div className="artifact-list">
              <div className="section-title">
                <SlidersHorizontal aria-hidden="true" />
                <span>Artifacts</span>
              </div>
              {job?.artifacts.length ? (
                job.artifacts.map((artifact) => (
                  <div className="artifact-row" key={`${artifact.kind}-${artifact.url}`}>
                    <span>{artifact.kind}</span>
                    <code>{artifact.url}</code>
                  </div>
                ))
              ) : (
                <div className="empty-state">No generated files yet</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
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
