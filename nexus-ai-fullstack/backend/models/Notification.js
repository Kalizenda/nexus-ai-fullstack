const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['new_registration', 'user_login', 'security_event', 'system'], default: 'system', index: true },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 500 },
  email: { type: String, default: '', maxlength: 254 },
  read: { type: Boolean, default: false, index: true },
  emailStatus: { type: String, enum: ['not_configured', 'sent', 'failed', 'not_requested'], default: 'not_configured' }
}, { timestamps: true, versionKey: false });
module.exports = mongoose.model('Notification', notificationSchema);
