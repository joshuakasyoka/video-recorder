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