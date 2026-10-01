const fs = require('fs');
const path = require('path');

const uploadRoot = path.join(__dirname, '..', 'uploads');

function safeFileName(fileName = 'upload.bin') {
  const parsed = path.parse(path.basename(fileName));
  const name = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'upload';
  const ext = parsed.ext.toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${name}${ext}`;
}

async function saveBufferToLocalUpload({ buffer, originalName, req, resourceType = 'raw' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { success: false, message: 'A file buffer is required.' };
  }

  await fs.promises.mkdir(uploadRoot, { recursive: true });
  const storedName = safeFileName(originalName);
  const absolutePath = path.join(uploadRoot, storedName);
  await fs.promises.writeFile(absolutePath, buffer);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    success: true,
    publicId: `local/${storedName}`,
    url: `${baseUrl}/uploads/${storedName}`,
    secureUrl: `${baseUrl}/uploads/${storedName}`,
    resourceType,
    bytes: buffer.length
  };
}

module.exports = { uploadRoot, saveBufferToLocalUpload };
