"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, Circle, Loader2, UploadCloud } from "lucide-react"

type JobState = {
  id: string
  url: string
  status:
    | "pending"
    | "downloading"
    | "converting"
    | "transcribing"
    | "analyzing"
    | "completed"
    | "error"
    | "stopped"
  progress: number
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  transcription?: any
  visualAnalysis?: any
  textAnalysis?: any
  evaluation?: {
    confidence: number
    professionalism: number
    summary: string
  }
}

export default function Page() {
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const existingJobId = params.get("jobId")
    if (existingJobId && !job) {
      fetch(`/api/jobs/${existingJobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !data.error) {
            if (data.status === "stopped") {
              window.history.replaceState(null, "", window.location.pathname)
            } else {
              setJob(data)
            }
          } else {
            // invalid job id or error, take user to home page
            window.history.replaceState(null, "", window.location.pathname)
          }
        })
        .catch(() => {
          // any network failure on ID fetch, fall back to home page
          window.history.replaceState(null, "", window.location.pathname)
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
    if (
      job &&
      ["pending", "downloading", "converting", "transcribing", "analyzing"].includes(
        job.status
      )
    ) {
      interval = setInterval(async () => {
        const res = await fetch(`/api/jobs/${job.id}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        })
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
    setJob(null)
    setUrl("")
    setFile(null)
    setLoading(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith("video/")) {
      setFile(droppedFile)
      setUrl("")
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type.startsWith("video/")) {
      setFile(selectedFile)
      setUrl("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url && !file) return
    setLoading(true)

    let res
    if (file) {
      const formData = new FormData()
      formData.append("file", file)
      res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })
    } else {
      res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
    }

    if (res.ok) {
      const { id } = await res.json()
      setJob({
        id,
        url: file ? "local" : url,
        status: "pending",
        progress: 0,
      })
    }
    setLoading(false)
  }

  const handleNext = () => {
    setJob(null)
    setUrl("")
    setFile(null)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Video Analyzer</h1>
          <p className="text-sm text-muted-foreground">
            Upload an interview video or provide a link to automatically
            transcribe speech, analyze facial expressions, and get an AI-powered
            applicant score.
          </p>
        </div>

        {/* Form (shows if no job or reset) */}
        {!job && (
          <form
            className="mx-auto flex w-full max-w-md flex-col gap-6"
            onSubmit={handleSubmit}
          >
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-upload")?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${file ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"}`}
            >
              <UploadCloud
                className={`mb-4 h-10 w-10 ${file ? "text-primary" : "text-muted-foreground"}`}
              />
              <p className="mb-1 text-center text-sm font-medium">
                {file ? file.name : "Drag and drop a video file here"}
              </p>
              <p className="text-center text-xs text-muted-foreground">
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                  : "or click to browse from your computer"}
              </p>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept="video/*"
                onChange={handleFileSelect}
                disabled={loading}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or provide a link
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Input
                type="url"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (e.target.value) setFile(null)
                }}
                disabled={loading}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (!url && !file)}
            >
              {loading ? "Creating Job..." : "Analyze Video"}
            </Button>
          </form>
        )}

        {/* Unified Pipeline UI */}
        {job &&
          ["pending", "downloading", "converting", "transcribing", "analyzing"].includes(
            job.status
          ) && (
            <div className="mx-auto flex w-full max-w-md animate-in flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm duration-300 fade-in zoom-in">
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-xl font-bold">Processing Pipeline</h2>
                {job.status !== "stopped" && job.status !== "error" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStop}
                    disabled={loading}
                  >
                    Stop
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-5">
                {/* Downloading Step */}
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {job.status === "pending" ||
                    job.status === "downloading" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>
                        {job.url === "local"
                          ? "Uploading Video"
                          : "Downloading Original Video"}
                      </span>
                      <span className="text-muted-foreground">
                        {["converting", "transcribing"].includes(job.status)
                          ? "100%"
                          : `${job.progress}%`}
                      </span>
                    </div>
                    {(job.status === "pending" ||
                      job.status === "downloading") && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Converting Step */}
                <div
                  className={`flex items-start gap-4 transition-opacity ${["pending", "downloading"].includes(job.status) ? "opacity-40" : "opacity-100"}`}
                >
                  <div className="mt-1">
                    {["pending", "downloading"].includes(job.status) ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : job.status === "converting" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Extracting 32-bit Float Audio</span>
                      <span className="text-muted-foreground">
                        {job.status === "transcribing"
                          ? "100%"
                          : job.status === "converting" && job.progress === 0
                            ? ""
                            : job.status === "converting"
                              ? `${job.progress}%`
                              : "0%"}
                      </span>
                    </div>
                    {job.status === "converting" && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        {job.progress === 0 ? (
                          <div className="animate-indeterminate h-full rounded-full bg-primary/70" />
                        ) : (
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcribing Step */}
                <div
                  className={`flex items-start gap-4 transition-opacity ${["pending", "downloading", "converting"].includes(job.status) ? "opacity-40" : "opacity-100"}`}
                >
                  <div className="mt-1">
                    {["pending", "downloading", "converting"].includes(
                      job.status
                    ) ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : job.status === "transcribing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Running AI Transcription</span>
                      <span className="text-muted-foreground">
                        {job.status === "transcribing" && "Processing..."}
                      </span>
                    </div>
                    {job.status === "transcribing" && (
                      <>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="animate-indeterminate h-full rounded-full bg-primary/70" />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {job.progress === 0
                            ? "Initializing & Loading AI model into RAM..."
                            : "Inference running on CPU, this could take some time..."}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Analyzing Step */}
                <div
                  className={`flex items-start gap-4 transition-opacity ${["pending", "downloading", "converting", "transcribing"].includes(job.status) ? "opacity-40" : "opacity-100"}`}
                >
                  <div className="mt-1">
                    {["pending", "downloading", "converting", "transcribing"].includes(
                      job.status
                    ) ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : job.status === "analyzing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Multi-modal AI Analysis</span>
                      <span className="text-muted-foreground">
                        {job.status === "analyzing" && "Running..."}
                      </span>
                    </div>
                    {job.status === "analyzing" && (
                      <>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="animate-indeterminate h-full rounded-full bg-primary/70" />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Detecting confidence, tone, and professionalism levels...
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Player & Output UI */}
        {job && job.status === "completed" && job.videoUrl && (
          <div className="flex w-full animate-in flex-col gap-6 duration-500 fade-in zoom-in">
            <div className="flex w-full flex-col gap-6">
              {/* Media */}
              <div className="flex w-full flex-col gap-4">
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <video
                    controls
                    poster={job.thumbnailUrl}
                    src={job.videoUrl}
                    className="aspect-video w-full object-cover"
                  />
                </div>

                {/* Evaluation Metrics */}
                {job.evaluation && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Confidence
                        </span>
                        <span className="text-lg font-bold">
                          {job.evaluation.confidence}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-blue-500 transition-all duration-1000"
                          style={{ width: `${job.evaluation.confidence}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Professionalism
                        </span>
                        <span className="text-lg font-bold">
                          {job.evaluation.professionalism}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-green-500 transition-all duration-1000"
                          style={{ width: `${job.evaluation.professionalism}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-full flex flex-col gap-3 rounded-xl border bg-primary/5 p-5 shadow-sm">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-primary">
                        AI Candidate Summary
                      </h4>
                      <p className="text-sm leading-relaxed text-foreground">
                        {job.evaluation.summary}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Transcription */}
              <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="border-b pb-2 text-lg font-semibold">
                  Transcription
                </h3>
                <div className="max-h-72 space-y-1 overflow-y-auto pr-2 text-sm leading-relaxed">
                  {job.transcription?.chunks ? (
                    job.transcription.chunks.map((chunk: any, i: number) => {
                      const start = new Date(chunk.timestamp[0] * 1000)
                        .toISOString()
                        .substr(14, 5)
                      const end = chunk.timestamp[1]
                        ? new Date(chunk.timestamp[1] * 1000)
                            .toISOString()
                            .substr(14, 5)
                        : "end"
                      return (
                        <div
                          key={i}
                          className="flex flex-col gap-1 rounded-lg p-2 leading-6 transition-colors hover:bg-muted/50"
                        >
                          <span className="font-mono text-xs text-primary opacity-80">
                            [{start} - {end}]
                          </span>
                          <span className="text-foreground">{chunk.text}</span>
                        </div>
                      )
                    })
                  ) : job.transcription?.text ? (
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {job.transcription.text}
                    </div>
                  ) : typeof job.transcription === "string" ? (
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {job.transcription}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      No spoken language detected.
                    </div>
                  )}
                </div>
              </div>
              {/* Model Evidence / Insights */}
              {job.visualAnalysis?.frames && (
                <div className="flex w-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-md">
                  <h3 className="border-b pb-3 text-xl font-bold flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                    Model Insights & Evidence
                  </h3>
                  
                  <div className="flex flex-col gap-8">
                    <div>
                      <h4 className="mb-4 text-xs font-bold text-primary uppercase tracking-widest">Visual Evidence (Key Moments)</h4>
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {job.visualAnalysis.frames.map((frame: any, idx: number) => {
                          const topEmotion = frame.emotions.reduce((prev: any, current: any) => (prev.score > current.score) ? prev : current);
                          const profScore = Math.round((frame.professionalism.find((l: any) => l.label.includes("professional"))?.score || 0) * 100);
                          
                          return (
                            <div key={idx} className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 transition-all hover:bg-muted/30">
                              <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                                <img 
                                  src={`/downloads/frames/${job.id}/${frame.filename}`} 
                                  alt={`Frame ${idx}`}
                                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                                />
                                <div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-mono text-white">
                                  Snapshot {idx + 1}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-col gap-1 text-[10px]">
                                  <span className="text-muted-foreground font-bold uppercase tracking-tight">Visual Impression:</span>
                                  <span className="font-bold leading-tight text-primary">
                                    {topEmotion.label.replace("a person ", "")}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-muted pt-2 text-xs">
                                  <span className="text-muted-foreground font-medium">Professionalism</span>
                                  <span className="font-bold text-foreground">{profScore}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {job.textAnalysis && (
                      <div className="border-t pt-6">
                        <h4 className="mb-4 text-xs font-bold text-primary uppercase tracking-widest">Verbal Style Score Breakdown</h4>
                        <div className="flex flex-col gap-4">
                          {job.textAnalysis.labels.map((label: string, idx: number) => {
                            const score = Math.round(job.textAnalysis.scores[idx] * 100);
                            return (
                              <div key={label} className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-sm font-semibold capitalize text-foreground">{label}</span>
                                  <span className="font-mono text-sm font-bold text-primary">{score}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                  <div 
                                    className="h-full bg-primary transition-all duration-1000"
                                    style={{ width: `${score}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleNext}
              variant="secondary"
              className="mx-auto mt-4 w-full max-w-md"
            >
              Analyze Next Video
            </Button>
          </div>
        )}

        {/* Error State */}
        {job && job.status === "error" && (
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-center">
            <div className="font-semibold text-destructive">
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
