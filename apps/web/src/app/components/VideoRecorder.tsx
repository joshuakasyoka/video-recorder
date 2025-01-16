'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Camera, Square, Upload, RefreshCcw, RotateCw } from 'lucide-react';

interface Recording {
  _id: string;
  snapshot?: string;
  transcription?: string;
}

type RecordingStatus = 'idle' | 'recording' | 'recorded' | 'processing' | 'uploaded' | 'error';

const VideoRecorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [transcript, setTranscript] = useState<string>('');
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState<boolean>(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const checkMobile = (): void => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    void fetchRecordings();
  }, []);

  const fetchRecordings = async (): Promise<void> => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/recordings`);
      const data = await response.json();
      setRecordings(data);
    } catch (err) {
      console.error('Error fetching recordings:', err);
    }
  };

  const getSupportedMimeType = (): string => {
    if (isMobile) {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return 'video/mp4';
      }
    }
    
    const types = [
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type);
        return type;
      }
    }
    return '';
  };

  const startRecording = async (): Promise<void> => {
    try {
      setError(null);
      setRecordedVideoUrl(null);
      setTranscript('');

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: isMicrophoneEnabled
      };

      console.log('Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }

      const mimeType = getSupportedMimeType();
      console.log('Selected MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      });
      
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          console.log('Received chunk of size:', e.data.size);
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        try {
          console.log('MediaRecorder stopped, processing chunks...');
          const mimeType = mediaRecorder.mimeType || 'video/mp4';
          const blob = new Blob(chunks, { type: mimeType });
          console.log('Created blob of type:', mimeType, 'size:', blob.size);
          
          const videoUrl = URL.createObjectURL(blob);
          console.log('Created video URL:', videoUrl);
          
          setRecordedChunks(chunks);
          setRecordedVideoUrl(videoUrl);

          if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.src = videoUrl;
            videoRef.current.muted = false;
            videoRef.current.controls = true;
            void videoRef.current.play().catch(err => console.log('Preview play error:', err));
          }
        } catch (err) {
          console.error('Error in onstop handler:', err);
          setError('Error processing recorded video');
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setStatus('recording');
      console.log('Started recording');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Failed to access camera/microphone: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStatus('error');
    }
  };

  const stopRecording = (): void => {
    try {
      if (mediaRecorderRef.current && isRecording) {
        console.log('Stopping recording...');
        mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setStatus('recorded');
      }
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError('Error stopping recording');
    }
  };

  const switchCamera = async (): Promise<void> => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      setFacingMode(prevMode => prevMode === 'user' ? 'environment' : 'user');
      await startRecording();
    } catch (err) {
      console.error('Error switching camera:', err);
      setError('Failed to switch camera');
    }
  };

  const uploadVideo = async () => {
    if (recordedChunks.length === 0) return;
    
    try {
      setStatus('processing');
      setError(null);
      
      const mimeType = mediaRecorderRef.current?.mimeType || 'video/mp4';
      console.log('Creating blob with MIME type:', mimeType);
      
      const videoBlob = new Blob(recordedChunks, { 
        type: mimeType.includes('mp4') ? 'video/mp4' : 
              mimeType.includes('webm') ? 'video/webm' : 
              'video/mp4'
      });
      
      const extension = mimeType.includes('webm') ? '.webm' : '.mp4';
      const filename = `recording-${Date.now()}${extension}`;
      
      console.log('Uploading video:', {
        type: videoBlob.type,
        size: videoBlob.size,
        filename: filename
      });
      
      const formData = new FormData();
      formData.append('video', videoBlob, filename);
  
      // Update this URL to match your API route
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/videos/upload`, {
        method: 'POST',
        body: formData
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Upload failed');
      }
  
      const result = await response.json();
      console.log('Upload result:', result);
      setTranscript(result.transcription);
      setStatus('uploaded');
      await fetchRecordings();
    } catch (err) {
      console.error('Error uploading video:', err);
      setError(`Failed to upload video: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStatus('error');
    }
  };

  const resetRecording = (): void => {
    setRecordedChunks([]);
    setRecordedVideoUrl(null);
    setTranscript('');
    setStatus('idle');
    setError(null);
    setIsRecording(false);
  };

  const toggleMicrophone = (): void => {
    setIsMicrophoneEnabled(prev => !prev);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="relative w-full aspect-video mb-4">
          <video
            ref={videoRef}
            className="w-full h-full rounded-lg bg-gray-100"
            autoPlay
            playsInline
            controls={!isRecording || recordedVideoUrl !== null}
            muted={isRecording}
          />
        </div>
        
        <div className="flex flex-col gap-4 mb-4">
          {!isRecording && !recordedVideoUrl && (
            <>
              <button
                onClick={() => void startRecording()}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <Camera className="w-5 h-5" />
                Start Recording
              </button>
              {isMobile && (
                <button
                  onClick={() => void switchCamera()}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  <RotateCw className="w-5 h-5" />
                  Switch Camera
                </button>
              )}
            </>
          )}
          {isRecording && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              <Square className="w-5 h-5" />
              Stop Recording
            </button>
          )}
          {recordedVideoUrl && (
            <>
              <button
                onClick={() => void uploadVideo()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Upload className="w-5 h-5" />
                Process & Upload
              </button>
              <button
                onClick={resetRecording}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                <RefreshCcw className="w-5 h-5" />
                Record New
              </button>
            </>
          )}
        </div>
        
        {error && (
          <div className="text-center text-red-600 mb-4 p-3 bg-red-50 rounded">
            {error}
          </div>
        )}
        
        {status === 'processing' && (
          <div className="text-center text-gray-600 p-3 bg-blue-50 rounded mb-4">
            Processing video and generating transcript...
          </div>
        )}
        
        {transcript && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Transcript:</h3>
            <p className="text-gray-700 bg-gray-50 p-3 rounded">{transcript}</p>
          </div>
        )}
      </div>

      {recordings.length > 0 && (
        <div className="border rounded-lg p-4 bg-white shadow-sm mt-8">
          <h2 className="text-xl font-semibold mb-4">Previous Recordings</h2>
          <div className="grid gap-6">
            {recordings.map((recording) => (
              <div key={recording._id} className="border rounded p-4">
                <div className="flex gap-4">
                  {recording.snapshot && (
                    <img 
                      src={`data:image/jpeg;base64,${recording.snapshot}`}
                      alt="Recording snapshot"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoRecorder;