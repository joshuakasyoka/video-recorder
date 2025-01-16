import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middlewares/upload';
import { VideoService } from '../services/videoService';

const router = Router();
const videoService = new VideoService();

// Define types for request parameters
interface VideoRequestParams {
  id?: string;
}

// Upload and process video
router.post('/upload', 
  upload.single('video'), 
  (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        console.log('Upload request received');
        console.log('Request file:', req.file);
        
        if (!req.file) {
          console.log('No file in request');
          return res.status(400).json({ error: 'No video file uploaded' });
        }

        const allowedTypes = ['video/mp4', 'video/x-m4v', 'video/x-msvideo', 'video/x-flv', 'video/x-matroska', 'video/webm'];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(400).json({ error: 'Invalid file type. Only video files are allowed.' });
        }

        console.log('Processing video...');
        const result = await videoService.processVideo(req.file);
        console.log('Video processed:', result);

        res.status(201).json(result);
      } catch (error) {
        console.error('Error in upload handler:', error);
        next(error);
      }
    })();
  }
);

// Get all recordings
router.get('/recordings', 
  (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const recordings = await videoService.getRecordings();
        res.json(recordings);
      } catch (error) {
        next(error);
      }
    })();
  }
);

// Get a single recording
router.get('/:id', 
  (req: Request<VideoRequestParams>, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const recording = await videoService.getRecording(req.params.id!);
        if (!recording) {
          res.status(404).json({ error: 'Recording not found' });
          return;
        }
        res.json(recording);
      } catch (error) {
        next(error);
      }
    })();
  }
);

// Delete a recording
router.delete('/:id', 
  (req: Request<VideoRequestParams>, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        await videoService.deleteRecording(req.params.id!);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    })();
  }
);

export { router as videoRouter };