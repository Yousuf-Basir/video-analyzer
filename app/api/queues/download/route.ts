import { Queue } from "quirrel/next-app"
import { getJob, updateJob } from "@/lib/db"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"

// Link fluent-ffmpeg to the static binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

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

            console.log("Attempting to fetch video from URL:", job.url)
            const response = await fetch(job.url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "*/*"
                },
                cache: "no-store"
            })
            if (!response.ok) throw new Error(`Failed to fetch video. Status: ${response.status} ${response.statusText} from ${job.url}`)

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
                    } else {
                        // fallback if no reliable content-length header
                        updateJob(id, { progress: 50, status: "downloading" })
                    }
                }

                fileStream.end()
            } else {
                throw new Error("No response body available to stream")
            }

            // --- Conversion Step ---
            updateJob(id, { status: "converting", progress: 0 })
            const audioFileName = `${id}.mp3`
            const audioFilePath = path.join(downloadsDir, audioFileName)

            await new Promise((resolve, reject) => {
                let lastReportedProgress = 0;
                let totalDurationSeconds = 0;

                ffmpeg(filePath)
                    .output(audioFilePath)
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .on('codecData', (data) => {
                        // Extract duration from codecData if available (format: HH:MM:SS.ms)
                        if (data.duration) {
                            const timeParts = data.duration.split(':');
                            if (timeParts.length === 3) {
                                totalDurationSeconds =
                                    parseFloat(timeParts[0]) * 3600 +
                                    parseFloat(timeParts[1]) * 60 +
                                    parseFloat(timeParts[2]);
                            }
                        }
                    })
                    .on('progress', (progress) => {
                        let currentPercent = progress.percent;

                        // Fallback manual percent calculation using 'timemark' and 'codecData' duration
                        if (!currentPercent && totalDurationSeconds > 0 && progress.timemark) {
                            const timeParts = progress.timemark.split(':');
                            if (timeParts.length === 3) {
                                const currentSeconds =
                                    parseFloat(timeParts[0]) * 3600 +
                                    parseFloat(timeParts[1]) * 60 +
                                    parseFloat(timeParts[2]);

                                currentPercent = (currentSeconds / totalDurationSeconds) * 100;
                            }
                        }

                        if (currentPercent && currentPercent > lastReportedProgress + 1) {
                            updateJob(id, {
                                status: "converting",
                                progress: Math.min(Math.round(currentPercent), 100)
                            })
                            lastReportedProgress = currentPercent;
                        }
                    })
                    .on('end', () => {
                        resolve(true)
                    })
                    .on('error', (err) => {
                        console.error('An error occurred generating audio: ' + err.message)
                        reject(err)
                    })
                    .run()
            })

            // Finalize with the locally downloaded video and audio URLs
            updateJob(id, {
                status: "completed",
                progress: 100,
                videoUrl: `/downloads/${fileName}`,
                audioUrl: `/downloads/${audioFileName}`,
            })
        } catch (error) {
            console.error("Job failed:", error)
            updateJob(id, { status: "error" })
        }
    }
)

export const POST = downloadQueue

