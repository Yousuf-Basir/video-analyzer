const { workerData, parentPort } = await eval("import('node:worker_threads')");
const { env, pipeline } = await eval("import('@xenova/transformers')");
const fs = (await eval("import('fs')")).default;

env.useBrowserCache = false;

async function run() {
    const { audioFilePath } = workerData;

    const rawBuffer = fs.readFileSync(audioFilePath);
    const audioData = new Float32Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength / 4);

    parentPort.postMessage({ type: 'status', status: 'loading_model' });
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: (data) => {
            parentPort.postMessage({ type: 'progress', data });
        }
    });

    parentPort.postMessage({ type: 'status', status: 'running_inference' });

    const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true
    });

    parentPort.postMessage({ type: 'done', result });

    if (transcriber.dispose) {
        await transcriber.dispose();
    }
}

run().catch(err => {
    parentPort.postMessage({ type: 'error', error: err.message || err.toString() });
});
