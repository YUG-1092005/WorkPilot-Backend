const { v2: cloudinary } = require('cloudinary');

// CLOUDINARY_URL is supported automatically by the SDK. The three separate
// variables are also supported because they are convenient on hosting panels.
if (!process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  cloudinary.config({ secure: true });
}

const assertCloudinaryConfigured = () => {
  const configuration = cloudinary.config();
  if (!configuration.cloud_name || !configuration.api_key || !configuration.api_secret) {
    const error = new Error('Cloudinary is not configured on the server');
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }
};

module.exports = { cloudinary, assertCloudinaryConfigured };
