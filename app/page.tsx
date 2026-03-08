import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Video Analyzer</h1>
          <p className="text-muted-foreground text-sm">
            Enter a video file URL to analyze its contents.
          </p>
        </div>

        <form className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Input
              type="url"
              placeholder="https://example.com/video.mp4"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Analyze Video
          </Button>
        </form>
      </div>
    </div>
  )
}
