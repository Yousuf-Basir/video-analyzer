"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog"
import { CheckCircle2, Circle, Loader2, Timer, ImageIcon, Trash2 } from "lucide-react"

type JobState = {
  id: string
  url: string
  status:
  | "pending"
  | "downloading"
  | "converting"
  | "transcribing"
  | "capturing_frames"
  | "completed"
  | "error"
  | "stopped"
  progress: number
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  transcription?: any
  frames?: { url: string; timestamp: number; analysis?: any }[]
  overallScore?: number
}

export default function ResultPage() {
  const router = useRouter()
  const [job, setJob] = useState<JobState | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loadingFrame, setLoadingFrame] = useState<number | null>(null)
  const [selectedFrames, setSelectedFrames] = useState<number[]>([])
  const [confirmDelete, setConfirmDelete] = useState<{ action: () => void, title: string, description: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const existingJobId = params.get("jobId")
    if (existingJobId && !job) {
      fetch(`/api/jobs/${existingJobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !data.error) {
            if (data.status === "stopped") {
              router.push("/")
            } else {
              setJob(data)
            }
          } else {
            // invalid job id or error, take user to home page
            router.push("/")
          }
        })
        .catch(() => {
          // any network failure on ID fetch, fall back to home page
          router.push("/")
        })
    } else if (!existingJobId) {
      router.push("/")
    }
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (
      job &&
      ["pending", "downloading", "converting", "transcribing", "capturing_frames"].includes(
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
    router.push("/")
  }

  const handleNext = () => {
    router.push("/")
  }

  const handleTranscribeNow = async () => {
    if (!job) return
    setLoading(true)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transcribe" }),
    })
    if (res.ok) {
      // The API returns { success: true, status: "pending" }
      // We should manually update local state to trigger polling
      setJob({ ...job, status: "pending", progress: 0 })
    }
    setLoading(false)
  }

  const handleReanalyzeFrame = async (index: number) => {
    if (!job) return
    setLoadingFrame(index)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "analyze_frame", frameIndex: index }),
    })
    if (res.ok) {
      const updatedJob = await res.json()
      setJob(updatedJob.job || updatedJob)
    }
    setLoadingFrame(null)
  }

  const handleDeleteJob = async () => {
    if (!job) return
    setLoading(true)
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
    router.push("/")
  }

  const handleDeleteTranscription = async () => {
    if (!job) return
    setLoading(true)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_transcription" }),
    })
    if (res.ok) {
      const updatedJob = await res.json()
      setJob(updatedJob.job || updatedJob)
    }
    setLoading(false)
  }

  const handleDeleteFrames = async (indices: number[]) => {
    if (!job || indices.length === 0) return
    setLoading(true)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_frames", frameIndices: indices }),
    })
    if (res.ok) {
      const updatedJob = await res.json()
      setJob(updatedJob.job || updatedJob)
      setSelectedFrames([])
    }
    setLoading(false)
  }

  const handleDeleteAnalysis = async (indices: number[]) => {
    if (!job || indices.length === 0) return
    setLoading(true)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_analysis", frameIndices: indices }),
    })
    if (res.ok) {
      const updatedJob = await res.json()
      setJob(updatedJob.job || updatedJob)
      setSelectedFrames([])
    }
    setLoading(false)
  }
  
  const toggleFrameSelection = (index: number) => {
    setSelectedFrames(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
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

        {/* Upload form removed */}

        {/* Unified Pipeline UI */}
        {job &&
          ["pending", "downloading", "converting", "transcribing", "capturing_frames"].includes(
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

                {/* Capturing Frames Step */}
                <div
                  className={`flex items-start gap-4 transition-opacity ${["pending", "downloading", "converting", "transcribing"].includes(job.status) ? "opacity-40" : "opacity-100"}`}
                >
                  <div className="mt-1">
                    {["pending", "downloading", "converting", "transcribing"].includes(
                      job.status
                    ) ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : job.status === "capturing_frames" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Capturing Frames</span>
                      <span className="text-muted-foreground">
                        {job.status === "capturing_frames" && `${job.progress}%`}
                      </span>
                    </div>
                    {job.status === "capturing_frames" && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Player & Output UI */}
        {job && job.status === "completed" && job.videoUrl && (
          <div className="flex w-full animate-in flex-col gap-6 duration-500 fade-in zoom-in">
            {job.overallScore !== undefined && (
              <div className="flex justify-between items-center bg-card rounded-xl border p-6 shadow-sm">
                <div>
                  <h2 className="text-xl font-bold">Applicant Professionalism Score</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Calculated by averaging the weighted expression analysis across all selected frames.
                  </p>
                </div>
                <div className="text-4xl font-extrabold text-primary">
                  {job.overallScore}%
                </div>
              </div>
            )}
            
            <div className="flex w-full flex-col gap-6">
              {/* Media */}
              <div className="flex w-full flex-col gap-4">
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <video
                    controls
                    poster={job.thumbnailUrl || (job.frames ? job.frames[0]?.url : undefined)}
                    src={job.videoUrl}
                    className="aspect-video w-full object-cover"
                  />
                </div>
              </div>

              {/* Frames Grid */}
              {job.frames && job.frames.length > 0 && (
                <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                  <h3 className="border-b pb-2 text-lg font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-primary" />
                      Captured Frames
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">{job.frames.length} frames</span>
                  </h3>
                  
                  {selectedFrames.length > 0 && (
                    <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md animate-in slide-in-from-top-2">
                      <span className="text-xs font-medium mr-auto pl-2">{selectedFrames.length} selected</span>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete({
                        title: `Delete ${selectedFrames.length} Expressions`,
                        description: `Are you sure you want to delete the expression analysis data for the ${selectedFrames.length} selected frames?`,
                        action: () => handleDeleteAnalysis(selectedFrames)
                      })} disabled={loading} className="h-7 text-xs">
                        Delete Selected Expressions
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setConfirmDelete({
                        title: `Delete ${selectedFrames.length} Frames`,
                        description: `Are you sure you want to permanently delete the ${selectedFrames.length} selected frames and their data?`,
                        action: () => handleDeleteFrames(selectedFrames)
                      })} disabled={loading} className="h-7 text-xs">
                        Delete Selected Frames
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-col gap-4 mt-4">
                    {job.frames.map((frame, i) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border bg-muted/30 relative">
                        <div className="absolute top-2 left-2 z-20">
                          <Checkbox checked={selectedFrames.includes(i)} onCheckedChange={() => toggleFrameSelection(i)} />
                        </div>
                        <div
                          className="group relative w-full sm:w-48 aspect-video cursor-pointer overflow-hidden rounded-md border bg-black shrink-0"
                        >
                          <img
                            src={frame.url}
                            alt={`Frame at ${frame.timestamp}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            onClick={() => setSelectedImage(frame.url)}
                          />
                          <Button
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDelete({
                                title: "Delete Frame",
                                description: "Are you sure you want to completely delete this frame and all associated data?",
                                action: () => handleDeleteFrames([i])
                              })
                            }}
                            disabled={loading}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          <div className="absolute bottom-1 right-1 pointer-events-none rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white flex items-center gap-1 z-10">
                            <Timer className="h-2 w-2" />
                            {new Date(frame.timestamp * 1000).toISOString().substr(14, 5)}
                          </div>
                        </div>

                        <div className="flex flex-col flex-1 gap-2 min-w-0">
                          <div className="font-semibold text-sm flex justify-between items-center">
                            <span>Analysis Results</span>
                            <div className="flex gap-2 flex-wrap justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5"
                                onClick={() => handleReanalyzeFrame(i)}
                                disabled={loadingFrame === i}
                              >
                                {loadingFrame === i ? (
                                  <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Analyzing...</>
                                ) : "Reanalyze"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2 text-destructive"
                                onClick={() => setConfirmDelete({
                                  title: "Delete Expression Data",
                                  description: "Are you sure you want to remove the expression analysis data for this frame? You can reanalyze it later.",
                                  action: () => handleDeleteAnalysis([i])
                                })}
                                disabled={loading || !frame.analysis}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Delete Analysis
                              </Button>
                            </div>
                          </div>

                          {frame.analysis ? (
                            <div className="text-sm text-muted-foreground flex flex-col gap-1.5">
                              {Array.isArray(frame.analysis) ? frame.analysis.map((item: any, idx: number) => {
                                const labelMap: Record<string, string> = {
                                  "A photo of a confident, smiling, or highly professional candidate in a job interview": "Confident & Professional",
                                  "A photo of an anxious, visibly nervous, or confused candidate in a job interview": "Confused or Nervous",
                                  "A photo of a distracted, unengaged, or unprofessional candidate in a job interview": "Unprofessional",
                                  "A photo of a candidate naturally explaining something or with a relaxed expression in a job interview": "Neutral"
                                }
                                const shortLabel = labelMap[item.label] || item.label
                                const percentage = Math.round(item.score * 100)

                                return (
                                  <div key={idx} className="relative flex justify-between items-center bg-background/40 rounded overflow-hidden shadow-sm border border-border/50">
                                    <div
                                      className="absolute left-0 top-0 h-full bg-primary/20 transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    />
                                    <span className="relative z-10 truncate px-2 py-1 text-xs font-medium">{shortLabel}</span>
                                    <span className="relative z-10 font-mono text-[10px] px-2 py-1 font-semibold">
                                      {percentage}%
                                    </span>
                                  </div>
                                )
                              }) : (
                                <div className="text-xs">{JSON.stringify(frame.analysis)}</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic flex py-2 items-center">
                              No analysis available for this frame.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcription */}
              <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="border-b pb-2 text-lg font-semibold flex justify-between items-center">
                  <span>Transcription</span>
                  {job.transcription && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete({
                      title: "Delete Transcription",
                      description: "Are you sure you want to permanently delete the transcription data for this video?",
                      action: handleDeleteTranscription
                    })} disabled={loading} className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4 mr-1" /> Delete Text
                    </Button>
                  )}
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
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                      <p className="text-muted-foreground">
                        No transcription available for this video.
                      </p>
                      <Button
                        onClick={handleTranscribeNow}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="w-fit"
                      >
                        {loading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          "Transcribe Now"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 mx-auto mt-4 w-full max-w-md">
              <Button onClick={handleNext} variant="secondary" className="flex-1">
                Analyze Next Video
              </Button>
              <Button onClick={() => setConfirmDelete({
                title: "Delete Job Entirely",
                description: "Are you sure you want to permanently delete this job, including the video, frames, metadata and transcripts?",
                action: handleDeleteJob
              })} variant="destructive" className="flex-1" disabled={loading}>
                Delete Job
              </Button>
            </div>
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

      {/* Lightbox */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 border-none bg-transparent shadow-none [&>button]:text-white">
          <DialogHeader className="sr-only">
            <DialogTitle>Frame Preview</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {selectedImage && (
              <img
                src={selectedImage}
                className="max-h-[85vh] w-auto rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                alt="Captured Frame Large Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{confirmDelete?.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{confirmDelete?.description}</p>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => {
              if (confirmDelete) {
                confirmDelete.action()
                setConfirmDelete(null)
              }
            }}>
              Confirm Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
