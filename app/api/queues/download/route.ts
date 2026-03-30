import { Queue } from "quirrel/next-app"
import { getJob, updateJob } from "@/lib/db"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
// Removed static import to avoid Turbopack tracing issue

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

      const downloadsDir = path.join(process.cwd(), "public", "downloads")
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true })
      }

      const fileName = `${id}.mp4`
      const filePath = path.join(downloadsDir, fileName)

      if (job.url !== "local" && !job.isLocal) {
        console.log("Attempting to fetch video from URL:", job.url)
        const response = await fetch(job.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
          },
          cache: "no-store",
        })
        if (!response.ok)
          throw new Error(
            `Failed to fetch video. Status: ${response.status} ${response.statusText} from ${job.url}`
          )

        const totalSize = Number(response.headers.get("content-length") || 0)

        const fileStream = fs.createWriteStream(filePath)
        let downloadedSize = 0

        if (response.body) {
          const reader = response.body.getReader()

          let lastReportedProgress = 0

          while (true) {
            const currentJob = getJob(id)
            if (currentJob?.status === "stopped") {
              fileStream.destroy()
              await reader.cancel()
              throw new Error("Job forcefully stopped by user during download")
            }

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

          await new Promise((resolve, reject) => {
            fileStream.on("finish", resolve)
            fileStream.on("error", reject)
            fileStream.end()
          })
          updateJob(id, { progress: 100, status: "downloading" })
        } else {
          updateJob(id, { progress: 100, status: "downloading" })
        }
      // Local file uploading already placed it in filePath
        updateJob(id, { progress: 100, status: "downloading" })
      }

      if (job.options?.transcribe === false) {
        // Finalize with the locally downloaded video, no transcription
        updateJob(id, {
          status: "completed",
          progress: 100,
          videoUrl: `/downloads/${fileName}`,
        })
        return
      }

      // --- Conversion Step ---
      updateJob(id, { status: "converting", progress: 0 })
      const audioFileName = `${id}.raw`
      const audioFilePath = path.join(downloadsDir, audioFileName)

      let totalDurationSeconds = 0

      await new Promise((resolve, reject) => {
        let lastReportedProgress = 0

        const cmd = ffmpeg(filePath)
          .output(audioFilePath)
          .noVideo()
          .format("f32le")
          .audioCodec("pcm_f32le")
          .audioFrequency(16000)
          .audioChannels(1)
          .on("codecData", (data) => {
            // Extract duration from codecData if available (format: HH:MM:SS.ms)
            if (data.duration) {
              const timeParts = data.duration.split(":")
              if (timeParts.length === 3) {
                totalDurationSeconds =
                  parseFloat(timeParts[0]) * 3600 +
                  parseFloat(timeParts[1]) * 60 +
                  parseFloat(timeParts[2])
              }
            }
          })
          .on("progress", (progress) => {
            const currentJob = getJob(id)
            if (currentJob?.status === "stopped") {
              cmd.kill("SIGKILL")
              return reject(
                new Error("Job forcefully stopped by user during conversion")
              )
            }

            let currentPercent = progress.percent

            // Fallback manual percent calculation using 'timemark' and 'codecData' duration
            if (
              !currentPercent &&
              totalDurationSeconds > 0 &&
              progress.timemark
            ) {
              const timeParts = progress.timemark.split(":")
              if (timeParts.length === 3) {
                const currentSeconds =
                  parseFloat(timeParts[0]) * 3600 +
                  parseFloat(timeParts[1]) * 60 +
                  parseFloat(timeParts[2])

                currentPercent = (currentSeconds / totalDurationSeconds) * 100
              }
            }

            // Super-fallback: if we STILL have no percent, at least fake some progress so UI isn't stuck at 0%
            if (!currentPercent) {
              currentPercent = Math.min(lastReportedProgress + 5, 95)
            }

            if (currentPercent && currentPercent > lastReportedProgress) {
              updateJob(id, {
                status: "converting",
                progress: Math.min(Math.round(currentPercent), 100),
              })
              lastReportedProgress = currentPercent
            }
          })
          .on("end", () => {
            updateJob(id, { status: "converting", progress: 100 })
            resolve(true)
          })
          .on("error", (err) => {
            console.error("An error occurred generating audio: " + err.message)
            reject(err)
          })

        cmd.run()
      })

      // --- Transcribing Step ---
      updateJob(id, { status: "transcribing", progress: 0 })

      const { Worker } = await eval("import('node:worker_threads')")
      const result = await new Promise((resolve, reject) => {
        const workerScriptPath = path.resolve(
          process.cwd(),
          "transcribe-worker.mjs"
        )
        const worker = new Worker(workerScriptPath, {
          workerData: { audioFilePath },
        })

        let stopChecker: NodeJS.Timeout = setInterval(() => {
          const currentJob = getJob(id)
          if (currentJob?.status === "stopped") {
            worker.terminate()
            clearInterval(stopChecker)
            reject(new Error("Job forcefully stopped by user during inference"))
          }
        }, 1000)

        // To keep the UI state minimal, we will store progress as 0 for loading, 1 for inference.
        worker.on("message", (msg: any) => {
          if (msg.type === "status") {
            if (msg.status === "loading_model") {
              updateJob(id, { status: "transcribing", progress: 0 })
            } else if (msg.status === "running_inference") {
              updateJob(id, { status: "transcribing", progress: 1 })
            }
          } else if (msg.type === "done") {
            clearInterval(stopChecker)
            resolve(msg.result)
          } else if (msg.type === "error") {
            clearInterval(stopChecker)
            reject(new Error(msg.error))
          }
        })

        worker.on("error", (err: Error) => {
          clearInterval(stopChecker)
          reject(err)
        })

        worker.on("exit", (code: number) => {
          clearInterval(stopChecker)
          if (code !== 0)
            reject(new Error(`Worker stopped with exit code ${code}`))
        })
      })

      // Finalize with the locally downloaded video, and rich transcription object
      updateJob(id, {
        status: "completed",
        progress: 100,
        videoUrl: `/downloads/${fileName}`,
        transcription: result,
      })
    } catch (error) {
      console.error("Job failed:", error)
      updateJob(id, { status: "error" })
    }
  }
)

export const POST = downloadQueue
