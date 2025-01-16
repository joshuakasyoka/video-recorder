// apps/web/src/app/page.tsx
import VideoRecorder from './components/VideoRecorder'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <VideoRecorder />
    </main>
  )
}