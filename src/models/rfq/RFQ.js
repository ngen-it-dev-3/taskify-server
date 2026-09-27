const mongoose = require('mongoose');

const RFQProductSchema = new mongoose.Schema(
    {
        sl: { type: Number, default: 1 },
        name: { type: String, required: true, trim: true },
        qty: { type: Number, required: true, min: 1 },
        spec: { type: String, default: '' },
        sku: { type: String, default: '' },
        modelNo: { type: String, default: '' },
        brand: { type: String, default: '' },
        description: { type: String, default: '' },
        additionalInfo: { type: String, default: '' },
        files: { type: [String], default: [] },
    },
    { _id: false }
);

const AddressSchema = new mongoose.Schema(
    {
        companyName: { type: String, default: '' },
        contactName: { type: String, default: '' },
        designation: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        address: { type: String, default: '' },
        country: { type: String, default: '' },
        city: { type: String, default: '' },
        zipCode: { type: String, default: '' },
    },
    { _id: false }
);

const RFQSchema = new mongoose.Schema(
    {
        rfqNumber: { type: String, required: true, unique: true, index: true },
        source: {
            type: String,
            enum: ['online', 'manual'],
            default: 'online',
            index: true,
        },
        company: { type: String, required: true, trim: true, index: true },
        country: { type: String, required: true, index: true },
        date: { type: String, required: true },
        time: { type: String, required: true },
        agingDays: { type: Number, default: 0 },
        stage: {
            type: String,
            enum: ['pending', 'quoted', 'archived', 'lost'],
            default: 'pending',
            index: true,
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
        },
        salesman: { type: String, default: 'Unassigned', index: true },
        assignedTo: { type: String, default: 'Unassigned' },
        receivedVia: {
            type: String,
            enum: ['Email', 'Phone', 'WhatsApp', 'In-Person', 'Other'],
            default: 'Email',
        },

        // Client info (flattened)
        contactName: { type: String, required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        phone: { type: String, default: '' },
        designation: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        zipCode: { type: String, default: '' },
        isReseller: { type: Boolean, default: false },

        shipping: { type: AddressSchema, default: undefined },
        endUser: { type: AddressSchema, default: undefined },

        projectName: { type: String, default: '' },
        tentativeBudget: { type: String, default: '' },
        currentProjectStatus: { type: String, default: '' },
        tentativePurchaseDate: { type: String, default: '' },
        comment: { type: String, default: '' },

        products: { type: [RFQProductSchema], default: [] },

        assignmentHistory: [
            {
                assignedTo: String,
                assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                assignedAt: { type: Date, default: Date.now },
                notes: String,
            },
        ],

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// ---- Text search index ----
RFQSchema.index({ company: 'text', rfqNumber: 'text', email: 'text' });
RFQSchema.index({ stage: 1, country: 1, createdAt: -1 });

// ---- Auto-compute agingDays before save ----
RFQSchema.pre('save', function (next) {
    const created = this.createdAt || new Date();
    const diffMs = Date.now() - new Date(created).getTime();
    this.agingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    next();
});

module.exports = mongoose.model('RFQ', RFQSchema);