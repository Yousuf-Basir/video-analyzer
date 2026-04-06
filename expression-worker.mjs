const { env, pipeline } = await eval("import('@xenova/transformers')");

env.useBrowserCache = false;

// We use process.argv[2] to receive the filepath when invoked via child_process.fork()
const imageFilePath = process.argv[2];

async function run() {
    if (process.send) process.send({ type: 'status', status: 'loading_model' });
    
    const classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        progress_callback: (data) => {
            if (process.send) process.send({ type: 'progress', data });
        }
    });

    if (process.send) process.send({ type: 'status', status: 'running_inference' });

    const candidate_labels = [
        "A photo of a confident, smiling, or highly professional candidate in a job interview",
        "A photo of a candidate naturally explaining something or with a relaxed expression in a job interview",
        "A photo of an anxious, visibly nervous, or confused candidate in a job interview",
        "A photo of a distracted, unengaged, or unprofessional candidate in a job interview"
    ];

    const result = await classifier(imageFilePath, candidate_labels);

    if (process.send) process.send({ type: 'done', result });
    
    if (classifier.dispose) {
        await classifier.dispose();
    }
    process.exit(0);
}

run().catch(err => {
    if (process.send) process.send({ type: 'error', error: err.message || err.toString() });
    process.exit(1);
});
