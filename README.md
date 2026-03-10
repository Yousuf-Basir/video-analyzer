# Video Analyzer

An intelligent AI recruitment and video analysis pipeline built with Next.js. It processes applicant video responses, extracts multi-modal signals (audio, transcriptions, and facial expressions), and uses LLM-based evaluation to calculate a comprehensive applicant score.

## 🎯 Project Goals & Pipeline

1. **Video Ingestion**: Take a direct video link as input.
2. **Server Download**: Securely download the video to the server for processing.
3. **Audio Extraction**: Convert the video into an audio format.
4. **Speech-to-Text**: Use the `whisper-tiny.en` model (via local AI) to transcribe the audio into text.
5. **Frame Extraction**: Extract key image frames from the video at regular intervals.
6. **Visual Analysis**: Use Hugging Face models to analyze facial expressions, confidence, and professionalism from the extracted frames.
7. **Comprehensive Scoring**: Use an LLM on Hugging Face to evaluate the combined transcribed text, visual expression scores, and the applicant's response to preset questions to generate an overall candidate score.

## ✨ Current Features

- **Automated Processing Pipeline**: Simply input a video URL and the app handles the rest.
- **Local AI Transcription**: Powered by `transformers.js` (`@xenova/transformers`), running the machine learning inference directly on the server without requiring external paid APIs.
- **Real-Time Job Tracking**: Beautiful, animated UI updates indicating the true real-time status of downloading, converting, and inferencing.
- **Background Task Management**: Heavy media processing runs asynchronously in the background using Quirrel.
- **Modern Stack**: Built with Next.js 16 (App Router), Tailwind CSS v4, and shadcn/ui primitives.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- [Quirrel](https://quirrel.dev/) for local job queue processing.

### Installation & Setup

1. **Clone the repository** (or download the source):
   ```bash
   git clone <repository-url>
   cd video-analyzer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Quirrel Development Server**:
   Quirrel is required to handle background processing tasks (downloading, conversion, etc.) without blocking the main server. Run it in a separate terminal space:
   ```bash
   npx quirrel
   ```
   *(This starts the Quirrel server locally, by default on port 9181).*

4. **Start the Next.js Development Server**:
   In your main terminal space, start Next.js with Turbopack for faster startup times:
   ```bash
   npm run dev
   ```
   *Note: Next.js reads the `PORT` variable from the `.env` file automatically to configure both the dev and production server. If you want to run on a different port, update the `PORT` variable inside `.env`.*

5. **Open the App**:
   Navigate to [http://localhost:4000](http://localhost:4000) (or the port you configured) in your preferred browser.

## 💻 Usage

1. Complete the installation steps and verify that both your Quirrel server and Next.js instance are running.
2. Open the application.
3. In the main input field, paste a direct URL to a video file.
4. Click "Analyze Video".
5. Watch the real-time processing pipeline as it downloads the media, extracts audio, and runs inference.
6. Review the transcription timeline alongside the completed processing assets.

## 🛠️ Tech Stack & Packages

- **Framework**: `Next.js 16.1.6`
- **Styling**: `Tailwind CSS v4`, `tw-animate-css`
- **UI Components**: `shadcn/ui`
- **Job Queues**: `quirrel`
- **Media Processing**: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `wavefile`
- **Machine Learning**: `@xenova/transformers`, Hugging Face Models
