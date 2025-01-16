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
  const [isBrowser, setIsBrowser] = useState<boolean>(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState<boolean>(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setIsBrowser(true);
    const checkMobile = (): void => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    void fetchRecordings();
  }, []);

  const fetchRecordings = async (): Promise<void> => {
    if (!isBrowser) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/recordings`);
      const data = await response.json();
      setRecordings(data);
    } catch (err) {
      console.error('Error fetching recordings:', err);
    }
  };

  const getSupportedMimeType = (): string => {
    if (!isBrowser) return '';
    
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
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  const startRecording = async (): Promise<void> => {
    if (!isBrowser) return;
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

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      });
      
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        try {
          const mimeType = mediaRecorder.mimeType || 'video/mp4';
          const blob = new Blob(chunks, { type: mimeType });
          const videoUrl = URL.createObjectURL(blob);
          
          setRecordedChunks(chunks);
          setRecordedVideoUrl(videoUrl);

          if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.src = videoUrl;
            videoRef.current.muted = false;
            videoRef.current.controls = true;
            void videoRef.current.play();
          }
        } catch (err) {
          console.error('Error in onstop handler:', err);
          setError('Error processing recorded video');
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Failed to access camera/microphone: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStatus('error');
    }
  };

  const stopRecording = (): void => {
    try {
      if (mediaRecorderRef.current && isRecording) {
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
      const videoBlob = new Blob(recordedChunks, { 
        type: mimeType.includes('mp4') ? 'video/mp4' : 
              mimeType.includes('webm') ? 'video/webm' : 
              'video/mp4'
      });
      
      const extension = mimeType.includes('webm') ? '.webm' : '.mp4';
      const filename = `recording-${Date.now()}${extension}`;
      
      const formData = new FormData();
      formData.append('video', videoBlob, filename);
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/videos/upload`, {
        method: 'POST',
        body: formData
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Upload failed');
      }
  
      const result = await response.json();
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

  if (!isBrowser) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-black text-white text-center py-3 mb-8 font-medium text-lg tracking-wide">
          IMAGINE ALGORITHMS
        </div>
        <div className="border-2 border-gray-300 rounded-lg p-6">
          <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xl font-medium">
              VIDEO
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-black text-white text-center py-3 mb-8 font-medium text-lg tracking-wide">
        IMAGINE ALGORITHMS
      </div>
      
      <div className="space-y-8">
        <div className="border-2 border-gray-300 rounded-lg p-6">
          <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {(!recordedVideoUrl && !isRecording) && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xl font-medium">
                VIDEO
              </div>
            )}
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              playsInline
              controls={!isRecording || recordedVideoUrl !== null}
              muted={isRecording}
            />
          </div>

          <div className="flex justify-center gap-6 mt-8">
            {recordedVideoUrl ? (
              <>
                <button
                  onClick={() => void uploadVideo()}
                  className="border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  UPLOAD & TRANSCRIBE
                </button>
                <button
                  onClick={resetRecording}
                  className="border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors"
                >
                  <RefreshCcw className="w-5 h-5" />
                  TAKE NEW VIDEO
                </button>
              </>
            ) : !isRecording ? (
              <>
                <button
                  onClick={() => void startRecording()}
                  className="border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  START RECORDING
                </button>
                <button
                  onClick={toggleMicrophone}
                  className={`border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors ${
                    isMicrophoneEnabled ? 'bg-blue-50' : ''
                  }`}
                >
                  {isMicrophoneEnabled ? 'Disable Microphone' : 'Enable Microphone'}
                </button>
                {isMobile && (
                  <button
                    onClick={() => void switchCamera()}
                    className="border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors"
                  >
                    <RotateCw className="w-5 h-5" />
                    SWITCH CAMERA
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={stopRecording}
                className="border-2 border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 font-medium transition-colors"
              >
                <Square className="w-5 h-5" />
                STOP RECORDING
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-center p-4 bg-red-50 rounded-lg border border-red-100">
            {error}
          </div>
        )}
        
        {status === 'processing' && (
          <div className="text-blue-600 text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
            Processing video and generating transcript...
          </div>
        )}

        {transcript && (
          <div className="border-2 border-gray-300 rounded-lg p-6">
            <div className="font-medium text-lg mb-4">TRANSCRIPTION:</div>
            <p className="text-gray-700 mb-8 leading-relaxed">
              {transcript}
            </p>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
                <button className="border-2 border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                  RELEVANT TAG
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoRecorder;