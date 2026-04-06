import { NextRequest, NextResponse } from "next/server"
import { getJob, updateJob, deleteJob } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  return NextResponse.json(job)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const body = await req.json()
  const { action, frameIndex, frameIndices } = body

  if (action === "stop") {
    updateJob(id, { status: "stopped" })
    return NextResponse.json({ success: true, status: "stopped" })
  }

  if (action === "transcribe") {
    updateJob(id, {
      status: "pending",
      progress: 0,
      options: {
        ...job.options,
        transcribe: true,
      },
    })
    await downloadQueue.enqueue({ id })
    return NextResponse.json({ success: true, status: "pending" })
  }

  if (action === "analyze_frame") {
    if (!job.frames || !job.frames[frameIndex]) {
      return NextResponse.json({ error: "Frame not found" }, { status: 400 })
    }

    const frame = job.frames[frameIndex]
    const path = await import("path")
    const { fork } = await eval("import('child_process')")
    
    // We get the absolute path for the image from public directory
    const imageFilePath = path.join(process.cwd(), "public", frame.url)

    try {
      const result = await new Promise((resolve, reject) => {
        const workerScriptPath = path.resolve(process.cwd(), "expression-worker.mjs")
        const child = fork(workerScriptPath, [imageFilePath])

        child.on("message", (msg: any) => {
          if (msg.type === "done") {
            resolve(msg.result)
          }
          if (msg.type === "error") {
            reject(new Error(msg.error))
          }
        })
        child.on("error", (err: any) => {
          reject(err)
        })
        child.on("exit", (code: number) => {
          if (code !== 0 && code !== null) reject(new Error(`Worker stopped with exit code ${code}`))
        })
      })

      const newFrames = [...job.frames]
      newFrames[frameIndex] = { ...frame, analysis: result }
      updateJob(id, { frames: newFrames })

      return NextResponse.json({ success: true, job: getJob(id) })
    } catch (err: any) {
      console.error("Frame analysis failed", err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  if (action === "delete_transcription") {
    // Setting to null effectively removes it from the job object in our typed JSON model without leaving undefined keys
    updateJob(id, { transcription: null })
    return NextResponse.json({ success: true, job: getJob(id) })
  }

  if (action === "delete_analysis") {
    if (!job.frames || !Array.isArray(frameIndices)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
    const newFrames = [...job.frames]
    for (const index of frameIndices) {
      if (newFrames[index]) {
        newFrames[index] = { ...newFrames[index], analysis: null }
      }
    }
    updateJob(id, { frames: newFrames })
    return NextResponse.json({ success: true, job: getJob(id) })
  }

  if (action === "delete_frames") {
    if (!job.frames || !Array.isArray(frameIndices)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
    // Filter out the selected frames
    const newFrames = job.frames.filter((_, index) => !frameIndices.includes(index))
    updateJob(id, { frames: newFrames })
    return NextResponse.json({ success: true, job: getJob(id) })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)
  
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  deleteJob(id)
  return NextResponse.json({ success: true })
}
