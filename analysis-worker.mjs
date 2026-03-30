import { workerData, parentPort } from 'node:worker_threads';
import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';

// Disable browser cache for Node.js environment
env.useBrowserCache = false;

async function run() {
    const { framesDir, transcription } = workerData;
    const results = {
        visual: {
            frames: [] // [{ filename, emotions, professionalism }]
        },
        text: null,
        evaluation: {
            confidence: 0,
            professionalism: 0,
            summary: ""
        }
    };

    try {
        // --- 1. Visual Analysis (CLIP) ---
        // Load, use, and dispose (if possible) the CLIP model separately
        const clipClassifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
        const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg'));

        // ... existing labels ...
        const profLabels = [
            "a person in professional recruitment attire",
            "a person in casual clothes like a t-shirt",
            "a professional office background",
            "a casual domestic room"
        ];
        const confLabelsVisual = [
            "a person speaking with confidence and authority",
            "a person appearing nervous or anxious",
            "a neutral professional expression"
        ];

        for (const file of frameFiles) {
            const filePath = path.join(framesDir, file);
            const profResults = await clipClassifier(filePath, profLabels);
            const confResults = await clipClassifier(filePath, confLabelsVisual);

            results.visual.frames.push({
                filename: file,
                emotions: confResults, 
                professionalism: profResults
            });
        }
        
        // --- 2. Text Analysis ---
        if (transcription && transcription.length > 5) {
            const textClassifier = await pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli');
            const safeText = transcription.substring(0, 1000);
            const confTextOutput = await textClassifier(safeText, ["confident and assertive", "hesitant and unsure"], { multi_label: false });
            const profTextOutput = await textClassifier(safeText, ["formal and professional speech", "casual speaking style"], { multi_label: false });
            
            results.text = {
                labels: [...confTextOutput.labels, ...profTextOutput.labels],
                scores: [...confTextOutput.scores, ...profTextOutput.scores]
            };
        }

        // --- 3. Synthesis / Evaluation ---
        let avgVisualConf = 0;
        let avgVisualProf = 0;

        results.visual.frames.forEach(frame => {
            // Visual Confidence: Confidence + Neutral - Nervous
            const conf = frame.emotions.find(e => e.label.includes("confidence"))?.score || 0;
            const neutral = frame.emotions.find(e => e.label.includes("neutral"))?.score || 0;
            const nervous = frame.emotions.find(e => e.label.includes("nervous"))?.score || 0;
            
            avgVisualConf += (conf + neutral * 0.5 - nervous * 0.5);

            // Visual Professionalism: Attire + Background
            const attire = frame.professionalism.find(l => l.label.includes("attire"))?.score || 0;
            const background = frame.professionalism.find(l => l.label.includes("background"))?.score || 0;
            avgVisualProf += (attire * 0.85 + background * 0.15);
        });

        const totalFrames = results.visual.frames.length || 1;
        avgVisualConf /= totalFrames;
        avgVisualProf /= totalFrames;

        // Textual Metrics
        const textConfScore = results.text?.scores[results.text?.labels.indexOf("confident and assertive")] || 0;
        const textProfScore = results.text?.scores[results.text?.labels.indexOf("formal and professional speech")] || 0;

        // Final weighted average: Visuals are important for first impressions
        results.evaluation.confidence = Math.round(((avgVisualConf * 0.7) + (textConfScore * 0.3)) * 100);
        results.evaluation.professionalism = Math.round(((avgVisualProf * 0.8) + (textProfScore * 0.2)) * 100);

        // Clamping and Summary
        results.evaluation.confidence = Math.min(100, Math.max(5, results.evaluation.confidence));
        results.evaluation.professionalism = Math.min(100, Math.max(5, results.evaluation.professionalism));

        const profLevel = results.evaluation.professionalism > 80 ? "exceptional" : results.evaluation.professionalism > 60 ? "highly professional" : "professional";
        const confLevel = results.evaluation.confidence > 80 ? "charismatic" : results.evaluation.confidence > 60 ? "very confident" : "balanced";
        
        results.evaluation.summary = `The candidate presented an ${profLevel} image with a ${confLevel} speaking style. Visual analysis of attire and background confirms high alignment with professional standards (${results.evaluation.professionalism}%).`;

        parentPort.postMessage({ type: 'done', result: results });
    } catch (err) {
        console.error("Analysis Worker Error:", err);
        parentPort.postMessage({ type: 'error', error: err.message || err.toString() });
    }
}

run();
