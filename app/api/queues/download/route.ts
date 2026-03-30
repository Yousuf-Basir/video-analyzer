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
      const { Worker } = await import("node:worker_threads")

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
      } else {
        // Local file uploading already placed it in filePath
        updateJob(id, { progress: 100, status: "downloading" })
      }

      // --- Conversion Step ---
      const audioFileName = `${id}.raw`
      const audioFilePath = path.join(downloadsDir, audioFileName)

      // Skip conversion if audio already exists
      if (fs.existsSync(audioFilePath) && job.transcription) {
        console.log("Audio file and transcription already exist, skipping conversion and transcription...")
      } else if (fs.existsSync(audioFilePath)) {
        console.log("Audio file already exists, skipping conversion...")
      } else {
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
                return reject(new Error("Job forcefully stopped by user during conversion"))
              }

              let currentPercent = progress.percent || 0
              if (currentPercent && currentPercent > lastReportedProgress) {
                updateJob(id, { status: "converting", progress: Math.min(Math.round(currentPercent), 100) })
                lastReportedProgress = currentPercent
              }
            })
            .on("end", () => {
              updateJob(id, { status: "converting", progress: 100 })
              resolve(true)
            })
            .on("error", (err) => reject(err))
          cmd.run()
        })
      }

      // --- Transcribing Step ---
      let result = job.transcription;

      if (!result) {
        updateJob(id, { status: "transcribing", progress: 0 })
        result = await new Promise((resolve, reject) => {
          const workerScriptPath = path.resolve(process.cwd(), "transcribe-worker.mjs")
          const worker = new Worker(workerScriptPath, { workerData: { audioFilePath } })

          let stopChecker: NodeJS.Timeout = setInterval(() => {
            const currentJob = getJob(id)
            if (currentJob?.status === "stopped") {
              worker.terminate()
              clearInterval(stopChecker)
              reject(new Error("Job forcefully stopped by user during inference"))
            }
          }, 1000)

          worker.on("message", (msg: any) => {
            if (msg.type === "status") {
              if (msg.status === "loading_model") updateJob(id, { status: "transcribing", progress: 0 })
              else if (msg.status === "running_inference") updateJob(id, { status: "transcribing", progress: 1 })
            } else if (msg.type === "done") {
              clearInterval(stopChecker)
              resolve(msg.result)
            } else if (msg.type === "error") {
              clearInterval(stopChecker)
              reject(new Error(msg.error))
            }
          })

          worker.on("error", (err: Error) => { clearInterval(stopChecker); reject(err) })
          worker.on("exit", (code: number) => {
            clearInterval(stopChecker)
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
          })
        })
      }

      // --- Frame Extraction Step ---
      updateJob(id, { status: "analyzing", progress: 0 })
      const framesDir = path.join(downloadsDir, "frames", id)
      
      if (fs.existsSync(framesDir) && fs.readdirSync(framesDir).length >= 5) {
        console.log("Frames already extracted, skipping...")
      } else {
        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
        // Extract 5 frames at evenly spaced intervals
        await new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .on("end", resolve)
            .on("error", (err) => {
              console.error("Frame extraction error:", err)
              reject(err)
            })
            .output(path.join(framesDir, "frame-%d.jpg"))
            .frames(5) // Capture exactly 5 frames distributed throughout the video
            .run()
        })
      }

      // Add a small delay after transcription to let the CPU breath on low-resource servers
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const analysisWorkerScriptPath = path.resolve(
        process.cwd(),
        "analysis-worker.mjs"
      )
      
      updateJob(id, { status: "analyzing", progress: 50 })

      const analysisResult = await new Promise((resolve, reject) => {
        const worker = new Worker(analysisWorkerScriptPath, {
          workerData: {
            framesDir,
            transcription: (result as any).text || "",
          },
        })

        worker.on("message", (msg: any) => {
          if (msg.type === "done") {
            resolve(msg.result)
          } else if (msg.type === "error") {
            reject(new Error(msg.error))
          }
        })

        worker.on("error", (err: Error) => reject(err))
        worker.on("exit", (code: number) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
        })
      })

      // Finalize with the locally downloaded video, and rich transcription object
      updateJob(id, {
        status: "completed",
        progress: 100,
        videoUrl: `/downloads/${fileName}`,
        transcription: result as any,
        visualAnalysis: (analysisResult as any).visual,
        textAnalysis: (analysisResult as any).text,
        evaluation: (analysisResult as any).evaluation,
      })
    } catch (error) {
      console.error("Job failed:", error)
      updateJob(id, { status: "error" })
    }
  }
)

export const POST = downloadQueue
