import multer from 'multer';

// Configure multer to use memory storage
const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : 100 * 1024 * 1024, // Default 100MB
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'video/webm',
      'video/x-m4v',
      'video/x-msvideo',
      'video/x-flv',
      'video/x-matroska'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only video files are allowed.'));
    }

    cb(null, true);
  }
});


import { OpenAI } from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import { connectToDatabase } from '../config/db';
import fs from 'fs';
import path from 'path';
import { Collection, ObjectId } from 'mongodb';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';

const writeFileAsync = promisify(fs.writeFile);

export interface Recording {
  _id: ObjectId;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  snapshot?: string;
  transcription?: string;
  createdAt: Date;
}

export class VideoService {
  private openai: OpenAI;
  private uploadsDir: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async processVideo(file: Express.Multer.File) {
    try {
      // Create temporary file paths
      const tempVideoPath = path.join(this.uploadsDir, `temp-${Date.now()}.mp4`);
      const thumbnailPath = path.join(this.uploadsDir, `thumbnail-${Date.now()}.jpg`);
      const audioPath = path.join(this.uploadsDir, `audio-${Date.now()}.mp3`);

      // Write buffer to temporary file
      await writeFileAsync(tempVideoPath, file.buffer);

      // Generate thumbnail
      await this.generateThumbnail(tempVideoPath, thumbnailPath);

      // Extract audio for transcription
      await this.extractAudio(tempVideoPath, audioPath);

      // Get transcription
      const transcription = await this.transcribeAudio(audioPath);

      // Save to database
      const db = await connectToDatabase();
      const collection = db.collection<Recording>('recordings');
      
      const thumbnail = fs.readFileSync(thumbnailPath, 'base64');
      
      const result = await collection.insertOne({
        _id: new ObjectId(),
        filename: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        transcription,
        createdAt: new Date()
      });

      // Cleanup temporary files
      fs.unlinkSync(tempVideoPath);
      fs.unlinkSync(audioPath);
      fs.unlinkSync(thumbnailPath);

      return {
        id: result.insertedId.toString(),
        transcription
      };
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }

  private generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['50%'],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x240'
        })
        .on('end', () => resolve())
        .on('error', reject);
    });
  }

  private extractAudio(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .toFormat('mp3')
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async transcribeAudio(audioPath: string): Promise<string> {
    const transcription = await this.openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1'
    });

    return transcription.text;
  }

  async getRecordings(): Promise<Recording[]> {
    const db = await connectToDatabase();
    const collection: Collection<Recording> = db.collection('recordings');
    return collection.find().sort({ createdAt: -1 }).toArray();
  }

  async getRecording(id: string): Promise<Recording | null> {
    const db = await connectToDatabase();
    const collection: Collection<Recording> = db.collection('recordings');
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async deleteRecording(id: string): Promise<void> {
    const db = await connectToDatabase();
    const collection: Collection<Recording> = db.collection('recordings');
    await collection.deleteOne({ _id: new ObjectId(id) });
  }
}