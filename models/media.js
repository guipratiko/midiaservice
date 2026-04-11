const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    gridfsId: { type: mongoose.Schema.Types.ObjectId, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
