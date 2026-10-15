const mongoose = require('mongoose');
const activitySchema = new mongoose.Schema({
  type: { type: String, required: true, index: true },
  email: { type: String, default: 'unknown', lowercase: true, trim: true, maxlength: 254 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  outcome: { type: String, enum: ['success', 'failed', 'info'], default: 'info' },
  details: { type: String, default: '', maxlength: 300 },
  ipAddress: { type: String, default: '', maxlength: 64 }
}, { timestamps: true, versionKey: false });
activitySchema.index({ createdAt: -1 });
module.exports = mongoose.model('Activity', activitySchema);
