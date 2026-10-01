function getCloudinaryConfig() {
  return {
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: String(process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: String(process.env.CLOUDINARY_API_SECRET || '').trim()
  };
}

function getCloudinaryClient() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.');
  }

  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  return cloudinary;
}

async function uploadToCloudinary({ fileData, folder = 'caremitra', resourceType = 'auto', publicId = '' }) {
  if (!fileData || typeof fileData !== 'string') {
    return { success: false, message: 'fileData is required as a base64 data URL or remote URL.' };
  }

  try {
    const cloudinary = getCloudinaryClient();
    const result = await cloudinary.uploader.upload(fileData, {
      folder,
      resource_type: resourceType,
      public_id: publicId || undefined,
      overwrite: false
    });

    return {
      success: true,
      publicId: result.public_id,
      url: result.secure_url,
      resourceType: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('PulseMD - Virtual Clinic Cloudinary upload failed:', error.message);
    return { success: false, message: error.message };
  }
}

function uploadBufferToCloudinary({ buffer, folder = 'caremitra', resourceType = 'auto', publicId = '' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return Promise.resolve({ success: false, message: 'A file buffer is required.' });
  }

  return new Promise((resolve) => {
    try {
      const cloudinary = getCloudinaryClient();
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          public_id: publicId || undefined,
          overwrite: false
        },
        (error, result) => {
          if (error) {
            console.error('PulseMD - Virtual Clinic Cloudinary stream upload failed:', error.message);
            resolve({ success: false, message: error.message });
            return;
          }

          resolve({
            success: true,
            publicId: result.public_id,
            url: result.secure_url,
            secureUrl: result.secure_url,
            resourceType: result.resource_type,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height
          });
        }
      );

      stream.end(buffer);
    } catch (error) {
      console.error('PulseMD - Virtual Clinic Cloudinary upload setup failed:', error.message);
      resolve({ success: false, message: error.message });
    }
  });
}

module.exports = { getCloudinaryConfig, uploadToCloudinary, uploadBufferToCloudinary };
