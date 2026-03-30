import { NextRequest, NextResponse } from "next/server"
import { createJob, findJobByUrl } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: NextRequest) {
  const { url, options: bodyOptions } = await req.json()

  // Read query params as fallback or overriding body options
  const searchParams = req.nextUrl.searchParams
  const checkExistingParam = searchParams.get("checkExisting")
  const transcribeParam = searchParams.get("transcribe")

  const checkExisting =
    checkExistingParam !== null
      ? checkExistingParam !== "false"
      : bodyOptions?.checkExisting !== false

  const transcribe =
    transcribeParam !== null
      ? transcribeParam !== "false"
      : bodyOptions?.transcribe !== false

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  // If we should check for an existing file
  if (checkExisting) {
    const existingJob = findJobByUrl(url)
    if (existingJob) {
      // If the user wants transcription and it's missing, maybe we should create a new job?
      // Or just return the existing one. "Reuse existing file" implies we just go there.
      // But if user ALSO wants a transcription and the existing job doesn't have it,
      // it might be better to create a new job but reuse the file.
      // For now, let's just return the existing job ID.
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
    },
  })

  await downloadQueue.enqueue({ id })

  return NextResponse.json({ id })
}
