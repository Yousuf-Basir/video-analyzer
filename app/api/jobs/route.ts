import { NextRequest, NextResponse } from "next/server"
import { createJob } from "@/lib/db"
import { downloadQueue } from "@/app/api/queues/download/route"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: NextRequest) {
    const { url } = await req.json()

    if (!url) {
        return NextResponse.json({ error: "No URL provided" }, { status: 400 })
    }

    const id = uuidv4()

    createJob({
        id,
        url,
        status: "pending",
        progress: 0,
    })

    await downloadQueue.enqueue({ id })

    return NextResponse.json({ id })
}
