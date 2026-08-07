const multer = require('multer');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(new Error('Only JPG, PNG and WebP images are allowed'));
    return callback(null, true);
  },
});

const uploadBusinessMedia = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
]);

module.exports = { uploadBusinessMedia };
