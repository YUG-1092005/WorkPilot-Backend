const multer = require('multer');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadReceipt = multer({
  // Keep the file only in memory until the controller uploads it to Cloudinary.
  // Nothing is written to the deployment's temporary filesystem.
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Receipt must be a JPG, PNG, or WebP image'));
    }
    return callback(null, true);
  },
});

module.exports = { uploadReceipt };
