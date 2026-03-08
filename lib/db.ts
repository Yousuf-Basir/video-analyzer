import fs from "fs"
import path from "path"

const dbPath = path.resolve(process.cwd(), "jobs.json")

export type JobStatus = "pending" | "downloading" | "converting" | "completed" | "error"

export interface Job {
    id: string
    url: string
    status: JobStatus
    progress: number
    videoUrl?: string
    audioUrl?: string
    thumbnailUrl?: string
}

export function getJobs(): Record<string, Job> {
    if (!fs.existsSync(dbPath)) return {}
    try {
        const data = fs.readFileSync(dbPath, "utf-8")
        return JSON.parse(data)
    } catch (e) {
        return {}
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
        jobs[id] = { ...jobs[id], ...updates }
        saveJobs(jobs)
    }
}

export function createJob(job: Job) {
    const jobs = getJobs()
    jobs[job.id] = job
    saveJobs(jobs)
}
