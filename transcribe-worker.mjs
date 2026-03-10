import { workerData, parentPort } from 'worker_threads';
import { env, pipeline } from '@xenova/transformers';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { WaveFile } = require('wavefile');

env.useBrowserCache = false;

async function run() {
    const { audioFilePath } = workerData;

    // Read the WAV file and convert to Float32Array for Whisper natively
    const wavBuffer = fs.readFileSync(audioFilePath)
    const wav = new WaveFile(wavBuffer)
    wav.toBitDepth('32f')
    wav.toSampleRate(16000)

    let rawSamples = wav.getSamples()
    let audioData;
    if (Array.isArray(rawSamples)) {
        audioData = new Float32Array(rawSamples.length > 0 ? rawSamples[0] : 0)
    } else {
        audioData = new Float32Array(rawSamples)
    }

    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: (data) => {
            parentPort.postMessage({ type: 'progress', data });
        }
    });

    parentPort.postMessage({ type: 'loaded' });

    const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
    });

    parentPort.postMessage({ type: 'done', result });
}

run().catch(err => {
    parentPort.postMessage({ type: 'error', error: err.message || err.toString() });
});
