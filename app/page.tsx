"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type JobState = {
  id: string
  url: string
  status: "pending" | "downloading" | "converting" | "completed" | "error"
  progress: number
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
}

export default function Page() {
  const [url, setUrl] = useState("")
  const [job, setJob] = useState<JobState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (job && (job.status === "pending" || job.status === "downloading" || job.status === "converting")) {
      interval = setInterval(async () => {
        const res = await fetch(`/api/jobs/${job.id}`)
        if (res.ok) {
          const updatedJob = await res.json()
          setJob(updatedJob)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [job])

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
      <div className="w-full max-w-md flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Video Analyzer</h1>
          <p className="text-muted-foreground text-sm">
            Enter a video file URL to analyze its contents.
          </p>
        </div>

        {/* Form (shows if no job or reset) */}
        {!job && (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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

        {/* Downloading UI */}
        {job && job.status === "downloading" && (
          <div className="flex flex-col gap-4 text-center">
            <h2 className="text-lg font-semibold animate-pulse">
              Downloading Original Video...
            </h2>
            <div className="flex items-center gap-4">
              <div className="h-3 w-full bg-secondary overflow-hidden rounded-full">
                <div
                  className="h-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium w-12 text-right">
                {job.progress}%
              </span>
            </div>
          </div>
        )}

        {/* Converting UI */}
        {job && job.status === "converting" && (
          <div className="flex flex-col gap-4 text-center">
            <h2 className="text-lg font-semibold animate-pulse text-primary">
              Extracting Audio...
            </h2>
            <div className="flex items-center gap-4">
              <div className="h-3 w-full bg-secondary overflow-hidden rounded-full">
                <div
                  className="h-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium w-12 text-right">
                {job.progress}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Running fluent-ffmpeg</p>
          </div>
        )}

        {/* Player UI */}
        {job && job.status === "completed" && job.videoUrl && (
          <div className="flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
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
            <Button onClick={handleNext} variant="secondary" className="w-full">
              Analyze Next Video
            </Button>
          </div>
        )}

        {/* Error State */}
        {job && job.status === "error" && (
          <div className="flex flex-col gap-4 text-center">
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
