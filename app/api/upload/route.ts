import { NextRequest, NextResponse } from "next/server"
import { createJob } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"
import { v4 as uuidv4 } from "uuid"
import fs from "fs"
import path from "path"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const optionsRaw = formData.get("options") as string
    const options = optionsRaw ? JSON.parse(optionsRaw) : {
      checkExisting: true,
      transcribe: true,
      captureFrames: true,
      frameCount: 5,
      analyzeExpressions: true,
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const id = uuidv4()
    const downloadsDir = path.join(process.cwd(), "public", "downloads")
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true })
    }

    const fileName = `${id}.mp4`
    const filePath = path.join(downloadsDir, fileName)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    fs.writeFileSync(filePath, buffer)

    createJob({
      id,
      url: "local",
      isLocal: true,
      status: "pending",
      progress: 0,
      options
    })

    await downloadQueue.enqueue({ id })

    return NextResponse.json({ id })
  } catch (e: any) {
    console.error("Upload error:", e)
    return NextResponse.json(
      { error: e.message || "Failed to upload file" },
      { status: 500 }
    )
  }
}
