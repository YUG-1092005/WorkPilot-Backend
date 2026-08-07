const { cloudinary, assertCloudinaryConfigured } = require('../config/cloudinary');

const uploadBusinessMedia = ({ buffer, businessId, kind, originalName }) => {
  assertCloudinaryConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: 'image',
      type: 'authenticated',
      folder: `workpilot/business/${businessId}/${kind}`,
      overwrite: false,
      unique_filename: true,
      filename_override: originalName,
      transformation: kind === 'logo'
        ? [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }]
        : [{ width: 1000, height: 500, crop: 'limit', quality: 'auto' }],
    }, (error, result) => {
      if (error) return reject(error);
      if (!result?.public_id) return reject(new Error('Cloudinary did not return an asset ID'));
      return resolve(result);
    });
    stream.end(buffer);
  });
};

const deleteBusinessMedia = async (asset) => {
  if (!asset?.publicId) return;
  assertCloudinaryConfigured();
  const result = await cloudinary.uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType || 'image',
    type: asset.deliveryType || 'authenticated',
    invalidate: true,
  });
  if (!['ok', 'not found'].includes(result?.result)) throw new Error('Cloudinary could not remove the asset');
};

const temporaryBusinessMediaUrl = (asset) => {
  assertCloudinaryConfigured();
  if (!asset?.publicId || !asset?.format) throw new Error('Business media metadata is incomplete');
  return cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType || 'image',
    type: asset.deliveryType || 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
  });
};

module.exports = { uploadBusinessMedia, deleteBusinessMedia, temporaryBusinessMediaUrl };
