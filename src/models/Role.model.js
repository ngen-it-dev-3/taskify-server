const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    level: { type: Number, default: 0, min: 0, max: 100 },
    permissions: [{ type: String }],
    isSystemRole: { type: Boolean, default: false },
    isPermanent: { type: Boolean, default: false }, // Permanent roles cannot be deleted
    canEdit: { type: Boolean, default: true }, // Whether role can be edited
    canDelete: { type: Boolean, default: true }, // Whether role can be deleted
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

roleSchema.index({ code: 1 });
roleSchema.index({ level: 1 });
roleSchema.index({ isSystemRole: 1 });
roleSchema.index({ isPermanent: 1 });

module.exports = { Role: mongoose.model('Role', roleSchema) };