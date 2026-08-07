const { cloudinary, assertCloudinaryConfigured } = require('../config/cloudinary');

const RECEIPT_DELIVERY_TYPE = 'authenticated';
const RECEIPT_RESOURCE_TYPE = 'image';

const uploadReceiptToCloudinary = ({ buffer, businessId, originalName }) => {
  assertCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: RECEIPT_RESOURCE_TYPE,
        type: RECEIPT_DELIVERY_TYPE,
        folder: `workpilot/receipts/${businessId}`,
        overwrite: false,
        use_filename: false,
        unique_filename: true,
        filename_override: originalName,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.public_id) return reject(new Error('Cloudinary did not return a receipt ID'));
        return resolve(result);
      },
    );

    stream.end(buffer);
  });
};

const deleteReceiptFromCloudinary = async ({ publicId, resourceType, deliveryType }) => {
  if (!publicId) return;
  assertCloudinaryConfigured();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType || RECEIPT_RESOURCE_TYPE,
    type: deliveryType || RECEIPT_DELIVERY_TYPE,
    invalidate: true,
  });
  if (!['ok', 'not found'].includes(result?.result)) {
    throw new Error('Cloudinary could not remove the receipt');
  }
};

const createTemporaryReceiptUrl = ({ publicId, format, resourceType, deliveryType }) => {
  assertCloudinaryConfigured();
  if (!publicId || !format) throw new Error('Receipt cloud metadata is incomplete');

  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType || RECEIPT_RESOURCE_TYPE,
    type: deliveryType || RECEIPT_DELIVERY_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
  });
};

module.exports = {
  uploadReceiptToCloudinary,
  deleteReceiptFromCloudinary,
  createTemporaryReceiptUrl,
};
