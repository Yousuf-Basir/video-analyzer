/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe", "fluent-ffmpeg", "@xenova/transformers", "wavefile"],
}

export default nextConfig
