"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { UploadCloud } from "lucide-react"

export default function Page() {
  const router = useRouter()
  const [url, setUrl] = useState(process.env.NEXT_PUBLIC_DEFAULT_VIDEO_LINK || "")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState({
    checkExisting: true,
    transcribe: true,
    captureFrames: true,
    frameCount: 5,
    analyzeExpressions: true,
  })

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
        body: JSON.stringify({ url, options }),
      })
    }

    if (res.ok) {
      const { id } = await res.json()
      router.push(`/result?jobId=${id}`)
    } else {
      setLoading(false)
    }
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

          <div className="flex flex-col gap-4 px-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkExisting"
                checked={options.checkExisting}
                onCheckedChange={(checked) =>
                  setOptions((prev) => ({
                    ...prev,
                    checkExisting: checked === true,
                  }))
                }
              />
              <Label
                htmlFor="checkExisting"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Reuse existing file if available
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="transcribe"
                checked={options.transcribe}
                onCheckedChange={(checked) =>
                  setOptions((prev) => ({
                    ...prev,
                    transcribe: checked === true,
                  }))
                }
              />
              <Label
                htmlFor="transcribe"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Transcribe video automatically
              </Label>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="captureFrames"
                  checked={options.captureFrames}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({
                      ...prev,
                      captureFrames: checked === true,
                      ...(checked !== true ? { analyzeExpressions: false } : {}),
                    }))
                  }
                />
                <Label
                  htmlFor="captureFrames"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Capture frames from video
                </Label>
              </div>

              {options.captureFrames && (
                <div className="flex flex-col gap-3 pl-6 animate-in slide-in-from-left-2 duration-200">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="frameCount" className="text-xs text-muted-foreground">
                      Number of frames: {options.frameCount}
                    </Label>
                    <input
                      id="frameCount"
                      type="range"
                      min="1"
                      max="20"
                      value={options.frameCount}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          frameCount: parseInt(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="analyzeExpressions"
                checked={options.analyzeExpressions}
                disabled={!options.captureFrames}
                onCheckedChange={(checked) =>
                  setOptions((prev) => ({
                    ...prev,
                    analyzeExpressions: checked === true,
                  }))
                }
              />
              <Label
                htmlFor="analyzeExpressions"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Run facial expression analysis
              </Label>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (!url && !file)}
          >
            {loading ? "Creating Job..." : "Analyze Video"}
          </Button>
        </form>
      </div>
    </div>
  )
}
