import fs from "fs"
import path from "path"

const dbPath = path.resolve(process.cwd(), "jobs.json")

export type JobStatus =
  | "pending"
  | "downloading"
  | "converting"
  | "transcribing"
  | "capturing_frames"
  | "completed"
  | "error"
  | "stopped"

export interface JobOptions {
  checkExisting?: boolean
  transcribe?: boolean
  captureFrames?: boolean
  frameCount?: number
  analyzeExpressions?: boolean
  rerunExpressions?: boolean
}

export interface Job {
  id: string
  url: string
  isLocal?: boolean
  status: JobStatus
  progress: number
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  transcription?: any
  frames?: { url: string; timestamp: number; analysis?: any }[]
  options?: JobOptions
}

export function getJobs(): Record<string, Job> {
  if (!fs.existsSync(dbPath)) return {}
  try {
    const data = fs.readFileSync(dbPath, "utf-8")
    return JSON.parse(data) as Record<string, Job>
  } catch {
    return {} as Record<string, Job>
  }
}

export function saveJobs(jobs: Record<string, Job>) {
  fs.writeFileSync(dbPath, JSON.stringify(jobs, null, 2))
}

export function getJob(id: string): Job | undefined {
  return getJobs()[id]
}

export function updateJob(id: string, updates: Partial<Job>) {
  const jobs = getJobs()
  if (jobs[id]) {
    // Lock: If the job is already completely stopped by the user,
    // silently reject any incoming lagging worker progress updaters trying to revive it.
    if (jobs[id].status === "stopped" && updates.status !== "stopped") {
      return
    }
    jobs[id] = { ...jobs[id], ...updates }
    saveJobs(jobs)
  }
}

export function createJob(job: Job) {
  const jobs = getJobs()
  jobs[job.id] = job
  saveJobs(jobs)
}

export function deleteJob(id: string) {
  const jobs = getJobs()
  if (jobs[id]) {
    delete jobs[id]
    saveJobs(jobs)
  }
}

export function findJobByUrl(url: string): Job | undefined {
  const jobs = getJobs()
  // Return the first completed job for this URL
  return Object.values(jobs).find(
    (j) => j.url === url && j.status === "completed"
  )
}
