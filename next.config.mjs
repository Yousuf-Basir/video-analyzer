/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg", "@xenova/transformers", "wavefile"],
}

export default nextConfig
