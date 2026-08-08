const path = require('path');
const multer = require('multer');

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const acceptedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    const mime = `${file.mimetype || ''}`.toLowerCase();
    const extension = path.extname(file.originalname || '').toLowerCase();
    const normalImage = acceptedMimeTypes.has(mime) && acceptedExtensions.has(extension);
    const androidFallback = mime === 'application/octet-stream' && acceptedExtensions.has(extension);
    if (!normalImage && !androidFallback) {
      return callback(new Error('Only JPG, JPEG, PNG and WebP images up to 5 MB are allowed'));
    }
    return callback(null, true);
  },
});

const uploadBusinessMedia = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
]);

module.exports = { uploadBusinessMedia };
