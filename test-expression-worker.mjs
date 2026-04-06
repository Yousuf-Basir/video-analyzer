import { fork } from "child_process"
import path from "path"

const imagePath = process.argv[2]
if (!imagePath) {
  console.error("Please provide an image path: node test-expression-worker.mjs <image-path>")
  process.exit(1)
}

const absolutePath = path.resolve(imagePath)
const workerScriptPath = path.resolve(process.cwd(), "expression-worker.mjs")

console.log(`Starting analysis for: ${absolutePath}`)

const child = fork(workerScriptPath, [absolutePath])

child.on("message", (msg) => {
  if (msg.type === "status") {
    console.log(`Status: ${msg.status}`)
  } else if (msg.type === "progress") {
    // Uncomment the next line to see model loading progress
    // console.log(`Progress: ${msg.data.status}`)
  } else if (msg.type === "done") {
    console.log("\n✅ Analysis Complete! Result:")
    console.log(JSON.stringify(msg.result, null, 2))
  } else if (msg.type === "error") {
    console.error("\n❌ Worker Error:", msg.error)
  }
})

child.on("error", (err) => {
  console.error("Failed to start worker:", err)
})

child.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.log(`Worker exited with code ${code}`)
  }
})
