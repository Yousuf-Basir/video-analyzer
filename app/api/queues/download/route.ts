import { Queue } from "quirrel/next-app"
import { getJob, updateJob } from "@/lib/db"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import ffprobeInstaller from "@ffprobe-installer/ffprobe"

// Link fluent-ffmpeg to the static binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

export const downloadQueue = Queue(
  "api/queues/download",
  async (jobPayload: { id: string }) => {
    const { id } = jobPayload
    const job = getJob(id)

    if (!job) {
      console.error("Job not found in database:", id)
      return
    }

    const transcribeEnabled = job.options?.transcribe !== false
    const captureFramesEnabled = job.options?.captureFrames !== false
    const frameCount = job.options?.frameCount || 5

    try {
      updateJob(id, { status: "downloading", progress: 0 })

      const downloadsDir = path.join(process.cwd(), "public", "downloads")
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true })
      }

      const fileName = `${id}.mp4`
      const filePath = path.join(downloadsDir, fileName)

      // --- Download / Reuse Step ---
      if (job.videoUrl && job.videoUrl.startsWith("/downloads/")) {
        const localPath = path.join(process.cwd(), "public", job.videoUrl)
        if (fs.existsSync(localPath)) {
          console.log("Reusing existing file for job:", id, "at", localPath)
          // If the reused file is named differently, it's better to copy or symlink it to our job-specific ID.
          // This keeps the ID -> filename mapping consistent.
          if (localPath !== filePath) {
            fs.copyFileSync(localPath, filePath)
          }
          updateJob(id, { progress: 100, status: "downloading" })
        }
      } else if (job.url !== "local" && !job.isLocal) {
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

      let totalDurationSeconds = 0

      // Get duration if we need it for frames or transcription
      if (captureFramesEnabled || transcribeEnabled) {
        await new Promise((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              console.error("FFprobe error:", err)
              resolve(true)
              return
            }
            if (metadata.format && metadata.format.duration) {
              totalDurationSeconds = Number(metadata.format.duration)
            } else if (metadata.streams && metadata.streams[0] && metadata.streams[0].duration) {
              totalDurationSeconds = Number(metadata.streams[0].duration)
            }
            resolve(true)
          })
        })
      }

      let finalFrames: any[] = []

      // --- Frame Capture Step ---
      if (captureFramesEnabled && totalDurationSeconds > 0) {
        const count = frameCount
        // If frames don't exist yet, or the requested count has changed, capture them
        if (!job.frames || job.frames.length === 0 || job.frames.length !== count) {
          updateJob(id, { status: "capturing_frames", progress: 0 })
          const framesDir = path.join(downloadsDir, "frames", id)
          if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir, { recursive: true })
          }

          const count = frameCount
          const timestamps: number[] = []
          for (let i = 0; i < count; i++) {
            timestamps.push((totalDurationSeconds / (count + 1)) * (i + 1))
          }

          await new Promise((resolve, reject) => {
            ffmpeg(filePath)
              .on("error", reject)
              .on("end", resolve)
              .screenshots({
                timestamps,
                folder: framesDir,
                filename: "frame-%i.jpg",
                size: "640x?",
              })
          })

          const oldFrames = job.frames || []
          finalFrames = timestamps.map((ts, i) => ({
            url: `/downloads/frames/${id}/frame-${i + 1}.jpg`,
            timestamp: ts,
            analysis: oldFrames[i] ? oldFrames[i].analysis : undefined
          }))
          updateJob(id, { frames: finalFrames, progress: 100 })
        } else {
          // Skip frame capture if already exists
          finalFrames = [...job.frames]
          updateJob(id, { progress: 100 })
        }

        // --- Expression Analysis Step ---
        if (job.options?.analyzeExpressions === true) {
           const { fork } = await eval("import('child_process')")
           const workerScriptPath = path.resolve(process.cwd(), "expression-worker.mjs")
           
           for (let i = 0; i < finalFrames.length; i++) {
              const imageFilePath = path.join(process.cwd(), "public", finalFrames[i].url)
              try {
                const result = await new Promise((resolve, reject) => {
                  const child = fork(workerScriptPath, [imageFilePath])
                  child.on("message", (msg: any) => { 
                    if(msg.type === "done") {
                      resolve(msg.result)
                    }
                    if(msg.type === "error") {
                      reject(new Error(msg.error)) 
                    }
                  })
                  child.on("error", (err: any) => {
                    reject(err)
                  })
                  child.on("exit", (code: number) => { 
                    if(code !== 0 && code !== null) reject(new Error(`Worker stopped with code ${code}`)) 
                  })
                })
                finalFrames[i].analysis = result
              } catch (e) {
                console.error("Frame analysis failed during pipeline for frame", i, e)
              }
           }
           updateJob(id, { frames: finalFrames })
        }
      }

      if (!transcribeEnabled) {
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
      if (transcribeEnabled && !job.transcription) {
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
              reject(
                new Error("Job forcefully stopped by user during inference")
              )
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
      } else {
        // Transcription already exists or not requested, skip to completion
        updateJob(id, {
          status: "completed",
          progress: 100,
          videoUrl: `/downloads/${fileName}`,
        })
      }
    } catch (error) {
      console.error("Job failed:", error)
      updateJob(id, { status: "error" })
    }
  }
)

export const POST = downloadQueue
