// src/models/Tender.model.js
const mongoose = require("mongoose");

/* ============================================================
   SUB-SCHEMA — Eligibility Requirements
   ============================================================ */
const EligibilityRequirementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    requirement: { type: String, required: true },
    ourRecord: { type: String, default: "" },
    match: {
      type: String,
      enum: ["Meets", "Gap", "Partial", ""],
      default: "",
    },
    note: { type: String, default: "" },
  },
  { _id: false },
);

/* ============================================================
   SUB-SCHEMA — Todo items (per section, no file)
   ============================================================ */
const TodoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

/* ============================================================
   SUB-SCHEMA — Submission Package Section
   ============================================================ */
const SectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },            // stable key (uuid)
    key: { type: String, required: true },           // "company_eligibility" | "technical" | ...
    title: { type: String, required: true },         // "Company & eligibility"
    description: { type: String, default: "" },
    portalHint: { type: String, default: "" },       // "Upload in the portal under ..."
    order: { type: Number, default: 0 },
    todoItems: { type: [TodoSchema], default: [] },
  },
  { _id: false },
);

/* ============================================================
   SUB-SCHEMA — Doc Task (NEW: Added companyDocId)
   ============================================================ */
const DocTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    owner: { type: String },
    status: { type: String, enum: ["Pending", "In Progress", "Done"], default: "Pending" },
    fileName: { type: String },
    fileUrl: { type: String },
    sectionId: { type: String, default: "" },

    // ✅ Links this task to a Company Document
    companyDocId: { type: mongoose.Schema.Types.ObjectId, ref: "CompanyDocument", default: null },
  },
  { timestamps: true }
);

/* ============================================================
   MAIN SCHEMA
   ============================================================ */
const TenderSchema = new mongoose.Schema(
  {
    /* ---------- BASIC INFO ---------- */
    tenderer: { type: String, required: true, trim: true, index: true }, // Company Name
    title: { type: String, required: true, trim: true },                 // Tender Name

    // ✅ NEW: Tender Details fields
    tenderRefNo: { type: String, default: "", trim: true },              // Tender Ref. No.
    tenderId: { type: String, default: "", trim: true },                 // Tender ID

    /* ---------- DRAFT FLAG ---------- */
    draft: { type: Boolean, default: false, index: true },

    /* ---------- LIFECYCLE STAGE ---------- */
    stage: {
      type: String,
      enum: ["potential", "active", "submitted", "lost", "won"],
      default: "potential",
      index: true,
    },

    /* ---------- TYPE (🟢 Added "Direct") ---------- */
    tenderType: {
      type: String,
      enum: ["eGP", "RFQ", "Direct", "Hardcopy Ref."],
      default: "eGP",
    },

    /* ---------- METADATA ---------- */
    tenderLink: { type: String, default: "" },
    recordedBy: { type: String, default: "" },
    responsiblePerson: { type: String, default: "" },
    description: { type: String, default: "" },

    /* 🟢 NEW: Source Site (crawler identified site name) */
    sourceSite: { type: String, default: "", trim: true, index: true },

    /* ---------- DATES ---------- */
    lastDateOfPurchase: { type: Date, default: null },   // Purchase Date
    lastDateOfSubmission: { type: Date, default: null }, // Schedule Closing Date
    submittedAt: { type: Date, default: null },

    /* ---------- VALUE ---------- */
    tentativeBudget: { type: Number, default: 0 },
    bidValue: { type: Number, default: 0 },

    // ✅ NEW: Tender Schedule fields
    scheduleValue: { type: Number, default: 0 },         // Tender Schedule Price
    purchaseFrom: { type: String, default: "" },         // Purchase From
    purchaseType: { type: String, default: "" },         // Purchase Type

    currency: {
      type: String,
      enum: ["BDT", "USD", "SAR", "AED", "INR", "EUR", "GBP"],
      default: "BDT",
    },

    /* ---------- SECURITY ---------- */
    tenderSecurityAmount: { type: Number, default: 0 },
    tenderSecurityValidity: { type: Date, default: null },
    performanceSecurityAmount: { type: Number, default: 0 },
    performanceSecurityValidity: { type: Date, default: null },
    securityMode: {
      type: String,
      enum: ["Online (eGP)", "Offline", "Bank Guarantee", ""],
      default: "",
    },

    /* ---------- SUBMISSION ---------- */
    submitted: { type: Boolean, default: false },
    mode: { type: String, default: "" },
    readiness: { type: Number, default: 0, min: 0, max: 100 },
    docStatus: {
      type: String,
      enum: [
        "Docs pending",
        "Docs in progress",
        "Complete",
        "Banking docs pending",
        "",
      ],
      default: "",
    },

    /* ---------- ADVERTISEMENT ---------- */
    advertisementFile: { type: String, default: "" },
    advertisementUrl: { type: String, default: "" },
    advertisementUploadedBy: { type: String, default: "" },
    advertisementUploadedAt: { type: Date, default: null },

    /* ---------- NOTES / ELIGIBILITY ---------- */
    note: { type: String, default: "" },
    eligibility: { type: String, default: "" },

    /* ---------- ELIGIBILITY REQUIREMENTS (structured) ---------- */
    eligibilityRequirements: {
      type: [EligibilityRequirementSchema],
      default: [],
    },

    /* ---------- ATTACHMENTS ---------- */
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, default: "" },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    /* ---------- COMPETITORS ---------- */
    otherParticipants: [
      {
        bidder: { type: String, required: true },
        value: { type: Number, default: 0 },
        isUs: { type: Boolean, default: false },
      },
    ],
    
    /* NEW: Agreement & Delivery Files ---------- */
    agreementFiles: [
      {
        title: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileName: { type: String },
        category: { type: String, enum: ["agreement", "delivery"], default: "agreement" },

        // ⭐ Agreement specific fields
        noaDate: { type: Date, default: null },
        contractDate: { type: Date, default: null },

        // ⭐ Delivery specific fields
        deliveryDate: { type: Date, default: null },
        invoiceDate: { type: Date, default: null },
        challanDate: { type: Date, default: null },
        mushakDate: { type: Date, default: null },

        uploadedAt: { type: Date, default: Date.now },
      }
    ],

    /* ---------- SUBMISSION CHECKLIST ---------- */
    checklist: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        checked: { type: Boolean, default: false },
        isCustom: { type: Boolean, default: false },
      },
    ],

    /* ---------- SUBMISSION PACKAGE (NEW) ---------- */
    packageMode: {
      type: String,
      enum: ["section_by_section", "single_package", "portal", "rfq", ""],
      default: "",
    },
    packageLabel: { type: String, default: "" },
    sections: { type: [SectionSchema], default: [] },
    notes: { type: String, default: "" },

    /* ---------- DOC TASKS (NEW) ---------- */
    docTasks: { type: [DocTaskSchema], default: [] },

    /* ---------- LOSS INFO ---------- */
    lossReason: { type: String, default: "" },
    lowestCompliantBidder: { type: String, default: "" },
    lowestCompliantValue: { type: Number, default: 0 },
    lostAt: { type: Date, default: null },

    /* ---------- STATUS ---------- */
    priority: {
      type: String,
      enum: ["high", "medium", "low", ""],
      default: "high",
    },
    tenderSecurityPurchased: { type: Boolean, default: false },

    /* ---------- RESPONSIBILITY ---------- */
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

    /* ---------- AUDIT ---------- */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    /* ---------- STAGE HISTORY ---------- */
    stageHistory: [
      {
        from: { type: String },
        to: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: { type: String, default: "" },
      },
    ],

    /* 🟢 NEW: Auto-Discovered Flag */
    autoDiscovered: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

/* ============================================================ */
TenderSchema.index({ draft: 1, updatedAt: -1 });
TenderSchema.index({ stage: 1, updatedAt: -1 });
TenderSchema.index({ tenderType: 1, updatedAt: -1 });
TenderSchema.index({ owner: 1, updatedAt: -1 });
TenderSchema.index({ stage: 1, owner: 1 });
TenderSchema.index({ sourceSite: 1, title: 1 }); // 🟢 for dedupe lookup
TenderSchema.index({ tenderer: "text", title: "text", description: "text" });
TenderSchema.index({ lastDateOfSubmission: 1 });
TenderSchema.index({ lastDateOfPurchase: 1 });

module.exports =
  mongoose.models.Tender || mongoose.model("Tender", TenderSchema);