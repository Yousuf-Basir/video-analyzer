import { NextRequest, NextResponse } from "next/server"
import { getJob, updateJob } from "@/lib/db"

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

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
