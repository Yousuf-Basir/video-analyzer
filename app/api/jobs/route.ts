import { NextRequest, NextResponse } from "next/server"
import { createJob, getJob } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  // Use a stable ID based on the URL hash to prevent global duplicate IDs/downloads
  const id = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)

  const existingJob = getJob(id);
  // Short-circuit if the job is already completed
  if (existingJob && existingJob.status === "completed") {
    return NextResponse.json({ id });
  }

  createJob({
    id,
    url,
    status: "pending",
    progress: 0,
  })

  await downloadQueue.enqueue({ id })

  return NextResponse.json({ id })
}
