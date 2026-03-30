import { NextRequest, NextResponse } from "next/server"
import { getJob, updateJob } from "@/lib/db"
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

  const { action } = await req.json()

  if (action === "stop") {
    updateJob(id, { status: "stopped" })
    return NextResponse.json({ success: true, status: "stopped" })
  }

  if (action === "transcribe") {
    // If the job already has a transcription, it will re-run.
    // If it was downloaded but not transcribed, it will transcribe.
    updateJob(id, {
      status: "pending",
      progress: 0,
      options: {
        ...job.options,
        transcribe: true,
      },
    })

    // Re-enqueue for processing.
    // Because downloadQueue also re-downloads if file doesn't exist,
    // this works for both existing video or redownloading if necessary.
    await downloadQueue.enqueue({ id })

    return NextResponse.json({ success: true, status: "pending" })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
