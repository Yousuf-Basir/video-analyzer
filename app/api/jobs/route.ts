import { NextRequest, NextResponse } from "next/server"
import { createJob, findJobByUrl, updateJob } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: NextRequest) {
  const { url, options: bodyOptions } = await req.json()

  const searchParams = req.nextUrl.searchParams
  const checkExistingParam = searchParams.get("checkExisting")
  const transcribeParam = searchParams.get("transcribe")
  const captureFramesParam = searchParams.get("captureFrames")
  const frameCountParam = searchParams.get("frameCount")

  const checkExisting =
    checkExistingParam !== null
      ? checkExistingParam !== "false"
      : bodyOptions?.checkExisting !== false

  const transcribe =
    transcribeParam !== null
      ? transcribeParam !== "false"
      : bodyOptions?.transcribe !== false

  const captureFrames =
    captureFramesParam !== null
      ? captureFramesParam !== "false"
      : bodyOptions?.captureFrames !== false

  const frameCount =
    frameCountParam !== null
      ? parseInt(frameCountParam)
      : bodyOptions?.frameCount || 5

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  // If we should check for an existing file
  if (checkExisting) {
    const existingJob = findJobByUrl(url)
    if (existingJob) {
      const hasTranscription = !!existingJob.transcription
      const hasFrames = !!existingJob.frames && existingJob.frames.length > 0

      // If existing job has everything we need, return its ID
      if (
        (!transcribe || hasTranscription) &&
        (!captureFrames || hasFrames)
      ) {
        return NextResponse.json({ id: existingJob.id })
      }

      // If we need something but the file is already there, update the existing job and reuse its ID
      updateJob(existingJob.id, {
        status: "pending",
        progress: 0,
        options: {
          ...existingJob.options,
          checkExisting,
          transcribe,
          captureFrames,
          frameCount,
        },
      })
      await downloadQueue.enqueue({ id: existingJob.id })
      return NextResponse.json({ id: existingJob.id })
    }
  }

  const id = uuidv4()

  createJob({
    id,
    url,
    status: "pending",
    progress: 0,
    options: {
      checkExisting,
      transcribe,
      captureFrames,
      frameCount,
    },
  })

  await downloadQueue.enqueue({ id })

  return NextResponse.json({ id })
}
