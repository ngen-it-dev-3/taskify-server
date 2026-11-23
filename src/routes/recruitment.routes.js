// src/routes/recruitment.routes.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
    getOverview,
    listPositions,
    createPosition,
    listCandidates,
    createCandidate,
    updateCandidate,
    downloadCandidateCv,
    listTestsAndSubmissions,
    createTest,
    createSubmission,
    listQuestionPapers,
    createQuestionPaper,
    listInterviewSelections,
    createInterviewSelection,
    listOnboardingHires,
    createOnboardingHire,
    updateOnboardingHire,
} = require("../controllers/recruitment.controller");

const router = express.Router();

const cvUploadDir = path.join(process.cwd(), "uploads", "recruitment-cvs");
if (!fs.existsSync(cvUploadDir)) {
    fs.mkdirSync(cvUploadDir, { recursive: true });
}

const cvStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(cvUploadDir)) {
            fs.mkdirSync(cvUploadDir, { recursive: true });
        }
        cb(null, cvUploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const base = path
            .basename(file.originalname || "CV", ext)
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 60);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${base}${ext}`);
    },
});

const uploadCv = multer({
    storage: cvStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authenticate);

const hrRoles = requireRole("super_admin", "admin", "hr_manager");

// Overview
router.get("/overview", getOverview);

// Open Positions
router.get("/positions", listPositions);
router.post("/positions", hrRoles, createPosition);

// Candidates & CV Bank
router.get("/candidates", listCandidates);
router.post("/candidates", hrRoles, uploadCv.single("cv"), createCandidate);
router.put("/candidates/:id", hrRoles, uploadCv.single("cv"), updateCandidate);
router.get("/candidates/:id/cv/download", downloadCandidateCv);

// Online Tests & Submissions
router.get("/tests", listTestsAndSubmissions);
router.post("/tests", hrRoles, createTest);
router.post("/submissions", hrRoles, createSubmission);

// Question Papers
router.get("/question-papers", listQuestionPapers);
router.post("/question-papers", hrRoles, createQuestionPaper);

// Interview Selections
router.get("/interview-selections", listInterviewSelections);
router.post("/interview-selections", hrRoles, createInterviewSelection);

// Onboarding Hires
router.get("/onboarding", listOnboardingHires);
router.post("/onboarding", hrRoles, createOnboardingHire);
router.patch("/onboarding/:id", hrRoles, updateOnboardingHire);

module.exports = router;