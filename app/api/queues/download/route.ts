import { Queue } from "quirrel/next-app"
import { getJob, updateJob } from "@/lib/db"
import fs from "fs"
import path from "path"

export const downloadQueue = Queue(
    "api/queues/download",
    async (jobPayload: { id: string }) => {
        const { id } = jobPayload
        const job = getJob(id)

        if (!job) {
            console.error("Job not found in database:", id)
            return
        }

        try {
            updateJob(id, { status: "downloading", progress: 0 })

            const response = await fetch(job.url)
            if (!response.ok) throw new Error(`Failed to fetch video. Status: ${response.status}`)

            const totalSize = Number(response.headers.get("content-length") || 0)

            // Setup public/downloads directory
            const downloadsDir = path.join(process.cwd(), "public", "downloads")
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir, { recursive: true })
            }

            const fileName = `${id}.mp4`
            const filePath = path.join(downloadsDir, fileName)

            const fileStream = fs.createWriteStream(filePath)
            let downloadedSize = 0

            if (response.body) {
                const reader = response.body.getReader()

                let lastReportedProgress = 0

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    fileStream.write(Buffer.from(value))
                    downloadedSize += value.length

                    if (totalSize > 0) {
                        const progress = Math.round((downloadedSize / totalSize) * 100)

                        // Optimize database writes by only updating every 1% jump
                        if (progress > lastReportedProgress) {
                            updateJob(id, { progress, status: "downloading" })
                            lastReportedProgress = progress
                        }
                    }
                }

                fileStream.end()
            } else {
                throw new Error("No response body available to stream")
            }

            // Finalize with the locally downloaded video URL
            updateJob(id, {
                status: "completed",
                progress: 100,
                videoUrl: `/downloads/${fileName}`,
            })
        } catch (error) {
            console.error("Download failed:", error)
            updateJob(id, { status: "error" })
        }
    }
)

export const POST = downloadQueue
