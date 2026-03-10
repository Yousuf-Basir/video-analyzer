"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"

type JobState = {
  id: string
  url: string
  status: "pending" | "downloading" | "converting" | "transcribing" | "completed" | "error" | "stopped"
  progress: number
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  transcription?: any
}

export default function Page() {
  const [url, setUrl] = useState("")
  const [job, setJob] = useState<JobState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const existingJobId = params.get("jobId")
    if (existingJobId && !job) {
      fetch(`/api/jobs/${existingJobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !data.error) setJob(data)
        })
    }
  }, [])

  useEffect(() => {
    if (job && job.id) {
      window.history.replaceState(null, "", `?jobId=${job.id}`)
    } else if (!job) {
      window.history.replaceState(null, "", window.location.pathname)
    }

    let interval: NodeJS.Timeout
    if (job && ["pending", "downloading", "converting", "transcribing"].includes(job.status)) {
      interval = setInterval(async () => {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store", headers: { 'Cache-Control': 'no-cache' } })
        if (res.ok) {
          const updatedJob = await res.json()
          setJob(updatedJob)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [job])

  const handleStop = async () => {
    if (!job) return
    setLoading(true)
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    })
    setJob({ ...job, status: "stopped" })
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })

    if (res.ok) {
      const { id } = await res.json()
      setJob({
        id,
        url,
        status: "pending",
        progress: 0,
      })
    }
    setLoading(false)
  }

  const handleNext = () => {
    setJob(null)
    setUrl("")
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6 bg-background">
      <div className="w-full max-w-2xl flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Video Analyzer</h1>
          <p className="text-muted-foreground text-sm">
            Enter a video file URL to automatically extract audio and transcribe it using local AI.
          </p>
        </div>

        {/* Form (shows if no job or reset) */}
        {!job && (
          <form className="flex flex-col gap-4 max-w-md mx-auto w-full" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Input
                type="url"
                placeholder="https://example.com/video.mp4"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating Job..." : "Analyze Video"}
            </Button>
          </form>
        )}

        {/* Unified Pipeline UI */}
        {job && ["pending", "downloading", "converting", "transcribing", "stopped"].includes(job.status) && (
          <div className="flex flex-col gap-6 max-w-md mx-auto w-full p-6 border rounded-xl bg-card shadow-sm animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="text-xl font-bold">Processing Pipeline</h2>
              {job.status !== "stopped" && job.status !== "error" && (
                <Button variant="destructive" size="sm" onClick={handleStop} disabled={loading}>Stop</Button>
              )}
            </div>

            {job.status === "stopped" ? (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mt-2">
                Processing has been forcefully stopped. All resources freed.
              </div>
            ) : (
              <div className="flex flex-col gap-5">

                {/* Downloading Step */}
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {job.status === 'pending' || job.status === 'downloading' ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span>Downloading Original Video</span>
                      <span className="text-muted-foreground">
                        {["converting", "transcribing"].includes(job.status) ? "100%" : `${job.progress}%`}
                      </span>
                    </div>
                    {(job.status === 'pending' || job.status === 'downloading') && (
                      <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Converting Step */}
                <div className={`flex items-start gap-4 transition-opacity ${['pending', 'downloading'].includes(job.status) ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="mt-1">
                    {['pending', 'downloading'].includes(job.status) ? (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    ) : job.status === 'converting' ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span>Extracting Audio Stream</span>
                      <span className="text-muted-foreground">
                        {job.status === 'transcribing' ? "100%" : (job.status === 'converting' && job.progress === 0) ? "" : job.status === 'converting' ? `${job.progress}%` : "0%"}
                      </span>
                    </div>
                    {job.status === 'converting' && (
                      <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                        {job.progress === 0 ? (
                          <div className="h-full bg-primary/70 animate-indeterminate rounded-full" />
                        ) : (
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcribing Step */}
                <div className={`flex items-start gap-4 transition-opacity ${['pending', 'downloading', 'converting'].includes(job.status) ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="mt-1">
                    {['pending', 'downloading', 'converting'].includes(job.status) ? (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    ) : job.status === 'transcribing' ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span>Running AI Transcription</span>
                      <span className="text-muted-foreground">
                        {(job.status === 'transcribing' && job.progress === 50) ? "" : job.status === 'transcribing' ? `${job.progress}%` : "0%"}
                      </span>
                    </div>
                    {job.status === 'transcribing' && (
                      <>
                        <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                          {job.progress === 50 ? (
                            <div className="h-full bg-primary/70 animate-indeterminate rounded-full" />
                          ) : (
                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {job.progress > 0 && job.progress < 50 ? "Downloading AI model (first run)..." : job.progress === 0 ? "Loading AI model..." : "Inference running on CPU, please wait..."}
                        </p>
                      </>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* Player & Output UI */}
        {job && job.status === "completed" && job.videoUrl && (
          <div className="flex flex-col gap-6 animate-in fade-in zoom-in duration-500 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Media Column */}
              <div className="flex flex-col gap-4">
                <div className="rounded-xl overflow-hidden border bg-card shadow-sm">
                  <video
                    controls
                    poster={job.thumbnailUrl}
                    src={job.videoUrl}
                    className="w-full aspect-video object-cover"
                  />
                </div>
                {job.audioUrl && (
                  <div className="flex flex-col gap-2 p-4 rounded-xl border bg-card/50 shadow-sm text-center">
                    <span className="text-sm font-semibold">Extracted Web Audio</span>
                    <audio controls src={job.audioUrl} className="w-full" />
                  </div>
                )}
              </div>

              {/* Transcription Column */}
              <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm p-5 gap-3">
                <h3 className="font-semibold text-lg border-b pb-2">Transcription</h3>
                <div className="text-sm leading-relaxed max-h-72 overflow-y-auto pr-2 space-y-1">
                  {job.transcription?.chunks ? (
                    job.transcription.chunks.map((chunk: any, i: number) => {
                      const start = new Date(chunk.timestamp[0] * 1000).toISOString().substr(14, 5);
                      const end = chunk.timestamp[1] ? new Date(chunk.timestamp[1] * 1000).toISOString().substr(14, 5) : "end";
                      return (
                        <div key={i} className="flex flex-col gap-1 p-2 hover:bg-muted/50 rounded-lg transition-colors leading-6">
                          <span className="text-primary font-mono text-xs opacity-80">
                            [{start} - {end}]
                          </span>
                          <span className="text-foreground">{chunk.text}</span>
                        </div>
                      )
                    })
                  ) : job.transcription?.text ? (
                    <div className="text-muted-foreground whitespace-pre-wrap">{job.transcription.text}</div>
                  ) : typeof job.transcription === "string" ? (
                    <div className="text-muted-foreground whitespace-pre-wrap">{job.transcription}</div>
                  ) : (
                    <div className="text-muted-foreground">No spoken language detected.</div>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={handleNext} variant="secondary" className="w-full max-w-md mx-auto mt-4">
              Analyze Next Video
            </Button>
          </div>
        )}

        {/* Error State */}
        {job && job.status === "error" && (
          <div className="flex flex-col gap-4 text-center max-w-md mx-auto w-full">
            <div className="text-destructive font-semibold">
              An error occurred during processing.
            </div>
            <Button onClick={handleNext} variant="outline" className="w-full">
              Try Again
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}
