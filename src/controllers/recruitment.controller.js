const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const {
  JobPosition,
  QuestionPaper,
  OnlineTest,
  TestSubmission,
  Candidate,
  InterviewSelection,
  OnboardingHire,
} = require("../models/Recruitment.model");

const CV_UPLOAD_DIR = path.join(process.cwd(), "uploads", "recruitment-cvs");
const ALLOWED_CV_EXT = new Set([".pdf", ".doc", ".docx"]);
const MAX_CV_BYTES = 10 * 1024 * 1024;

const ensureCvDir = () => {
  if (!fs.existsSync(CV_UPLOAD_DIR)) {
    fs.mkdirSync(CV_UPLOAD_DIR, { recursive: true });
  }
};

const safeUnlink = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("Failed to remove CV file:", filePath, err.message);
  }
};

const extractCvMeta = (file) => {
  if (!file) return null;
  const originalName = (file.originalname || "CV.pdf").trim();
  const ext = path.extname(originalName).toLowerCase();

  if (!ALLOWED_CV_EXT.has(ext)) {
    safeUnlink(file.path);
    return {
      error: `Unsupported CV format (${ext || "none"}). Allowed: ${Array.from(ALLOWED_CV_EXT).join(", ")}`,
    };
  }

  const size = Number(file.size || 0);
  if (size > MAX_CV_BYTES) {
    safeUnlink(file.path);
    return { error: "CV file exceeds the 10MB limit." };
  }

  const storedName = file.filename || path.basename(file.path || "");
  return {
    cvFileName: originalName,
    cvFileUrl: `/uploads/recruitment-cvs/${storedName}`,
    cvFilePath: file.path || path.join(CV_UPLOAD_DIR, storedName),
    cvFileSize: size,
  };
};

// GET /api/v1/recruitment/overview
const getOverview = async (_req, res) => {
  try {
    const [positions, candidates, tests, hires] = await Promise.all([
      JobPosition.find({ isActive: true }).sort({ updatedAt: -1 }),
      Candidate.find({ isActive: true }),
      OnlineTest.find({ isActive: true, status: "Active" }),
      OnboardingHire.find({ isActive: true, status: "In Progress" }),
    ]);

    const takenSum = tests.reduce((s, t) => s + Number(t.candidatesTaken || 0), 0);
    const totalSum = tests.reduce((s, t) => s + Number(t.candidatesTotal || 0), 0);

    const firstHire = hires[0];

    return res.json({
      success: true,
      data: {
        openPositions: {
          count: positions.length,
          subtitle: positions[0]?.title || "No open position",
        },
        candidatesInPipeline: {
          count: candidates.length,
          subtitle: "Across open positions",
        },
        activeOnlineTests: {
          count: tests.length,
          subtitle:
            totalSum > 0 ? `${takenSum} of ${totalSum} submitted` : `${takenSum} submitted`,
        },
        onboardingInProgress: {
          count: hires.length,
          subtitle: firstHire
            ? `${firstHire.completedSteps} of ${firstHire.totalSteps} steps done`
            : "0 of 6 steps done",
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load recruitment overview",
      error: error.message,
    });
  }
};

// POSITIONS
const listPositions = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const filter = { isActive: true };
    if (String(search).trim()) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$or = [{ title: rx }, { department: rx }];
    }

    const positions = await JobPosition.find(filter).sort({ createdAt: 1 });
    const candCounts = await Candidate.aggregate([
      { $match: { isActive: true, positionId: { $ne: null } } },
      { $group: { _id: "$positionId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(candCounts.map((c) => [c._id.toString(), c.count]));

    const data = positions.map((p) => {
      const obj = p.toObject();
      obj.candidateCount = countMap.get(p._id.toString()) || 0;
      return obj;
    });

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createPosition = async (req, res) => {
  try {
    const { title, department, stage = "interviewing", targetStartDate = null, description = "" } =
      req.body;
    if (!title?.trim() || !department?.trim()) {
      return res.status(400).json({ success: false, message: "Title and department are required" });
    }

    const created = await JobPosition.create({
      title: String(title).trim(),
      department: String(department).trim(),
      stage,
      targetStartDate: targetStartDate ? new Date(targetStartDate) : null,
      description: String(description || "").trim(),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Position created",
      data: { ...created.toObject(), candidateCount: 0 },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updatePosition = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid position ID" });
    }

    const { title, department, stage, targetStartDate, description } = req.body;
    const updates = { updatedBy: req.user._id };

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ success: false, message: "Title cannot be empty" });
      }
      updates.title = String(title).trim();
    }

    if (department !== undefined) {
      if (!String(department).trim()) {
        return res.status(400).json({ success: false, message: "Department cannot be empty" });
      }
      updates.department = String(department).trim();
    }

    if (stage !== undefined) {
      updates.stage = stage;
    }

    if (description !== undefined) {
      updates.description = String(description || "").trim();
    }

    if (targetStartDate !== undefined) {
      updates.targetStartDate = targetStartDate ? new Date(targetStartDate) : null;
    }

    const updated = await JobPosition.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Position not found" });
    }

    const candidateCount = await Candidate.countDocuments({
      isActive: true,
      positionId: updated._id,
    });

    return res.json({
      success: true,
      message: "Position updated",
      data: { ...updated.toObject(), candidateCount },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deletePosition = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid position ID" });
    }

    const deleted = await JobPosition.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: { isActive: false, updatedBy: req.user._id } },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Position not found" });
    }

    return res.json({
      success: true,
      message: "Position deleted",
      data: deleted,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// CANDIDATES & CV BANK
const listCandidates = async (req, res) => {
  try {
    const {
      positionId,
      stage,
      gender,
      department,
      minExp,
      maxExp,
      interviewedBefore,
      blacklistedOnly,
      search = "",
    } = req.query;

    const filter = { isActive: true };

    if (positionId && positionId !== "all") {
      if (positionId === "unlinked") {
        filter.positionId = null;
      } else if (mongoose.Types.ObjectId.isValid(positionId)) {
        filter.positionId = positionId;
      }
    }

    if (stage && String(stage).toLowerCase() !== "all") {
      filter.stage = stage;
    }

    if (gender && String(gender).toLowerCase() !== "all") {
      filter.gender = gender;
    }

    if (department && String(department).toLowerCase() !== "all") {
      filter.department = new RegExp(`^${String(department).trim()}$`, "i");
    }

    if (minExp !== undefined && String(minExp).trim() !== "") {
      filter.experienceYears = { ...(filter.experienceYears || {}), $gte: Number(minExp) || 0 };
    }
    if (maxExp !== undefined && String(maxExp).trim() !== "") {
      filter.experienceYears = { ...(filter.experienceYears || {}), $lte: Number(maxExp) || 99 };
    }

    if (interviewedBefore === "true" || interviewedBefore === "yes") {
      filter.interviewedBefore = true;
    } else if (interviewedBefore === "false" || interviewedBefore === "no") {
      filter.interviewedBefore = false;
    }

    if (blacklistedOnly === "true") {
      filter.blacklisted = true;
    }

    if (String(search).trim()) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$or = [
        { fullName: rx },
        { department: rx },
        { source: rx },
        { positionAppliedLabel: rx },
        { cvFileName: rx },
      ];
    }

    const candidates = await Candidate.find(filter)
      .populate("positionId", "title department")
      .sort({ createdAt: 1 });

    return res.json({ success: true, data: candidates, count: candidates.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createCandidate = async (req, res) => {
  try {
    ensureCvDir();
    const {
      fullName,
      email = "",
      phone = "",
      gender = "",
      department = "",
      experienceYears = 0,
      interviewedBefore = false,
      positionId = "",
      positionAppliedLabel = "",
      source = "Online Test Portal",
      stage = "On File",
      testScore = null,
      blacklisted = false,
      blacklistReason = "",
      notes = "",
    } = req.body;

    if (!fullName?.trim()) {
      if (req.file?.path) safeUnlink(req.file.path);
      return res.status(400).json({ success: false, message: "Candidate name is required" });
    }

    const cvMeta = extractCvMeta(req.file);
    if (cvMeta?.error) {
      return res.status(400).json({ success: false, message: cvMeta.error });
    }

    let validPosId = null;
    let resolvedPosTitle = String(positionAppliedLabel || "").trim();
    if (positionId && mongoose.Types.ObjectId.isValid(positionId)) {
      validPosId = positionId;
      const posDoc = await JobPosition.findById(positionId).select("title department");
      if (posDoc && !resolvedPosTitle) resolvedPosTitle = posDoc.title;
    }

    const parsedScore =
      testScore !== undefined && testScore !== null && String(testScore).trim() !== ""
        ? Math.min(100, Math.max(0, Number(testScore)))
        : null;

    const isBlacklisted = blacklisted === true || blacklisted === "true";

    const created = await Candidate.create({
      fullName: String(fullName).trim(),
      email: String(email || "").trim().toLowerCase(),
      phone: String(phone || "").trim(),
      gender: ["Male", "Female", "Other"].includes(gender) ? gender : "",
      department: String(department || "").trim(),
      experienceYears: Math.max(0, Number(experienceYears) || 0),
      interviewedBefore:
        interviewedBefore === true ||
        interviewedBefore === "true" ||
        interviewedBefore === "yes",
      positionId: validPosId,
      positionAppliedLabel: resolvedPosTitle || "Unlinked / Speculative",
      source: String(source || "Online Test Portal").trim(),
      stage: isBlacklisted ? "Not Selected" : stage,
      testScore: Number.isNaN(parsedScore) ? null : parsedScore,
      blacklisted: isBlacklisted,
      blacklistReason: isBlacklisted
        ? String(blacklistReason || "").trim() || "Policy violation"
        : String(blacklistReason || "").trim(),
      cvFileName: cvMeta?.cvFileName || "CV.pdf",
      cvFileUrl: cvMeta?.cvFileUrl || "",
      cvFilePath: cvMeta?.cvFilePath || "",
      cvFileSize: cvMeta?.cvFileSize || 0,
      notes: String(notes || "").trim(),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await Candidate.findById(created._id).populate(
      "positionId",
      "title department"
    );

    return res.status(201).json({
      success: true,
      message: "Candidate & CV added",
      data: populated,
    });
  } catch (error) {
    if (req.file?.path) safeUnlink(req.file.path);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateCandidate = async (req, res) => {
  try {
    ensureCvDir();
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.file?.path) safeUnlink(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid candidate ID" });
    }

    const existing = await Candidate.findOne({ _id: id, isActive: true });
    if (!existing) {
      if (req.file?.path) safeUnlink(req.file.path);
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    const wantsBlacklisted =
      req.body.blacklisted === true ||
      req.body.blacklisted === "true" ||
      req.body.autoBlacklist === true ||
      req.body.autoBlacklist === "true";

    const isCurrentlyBlacklisted = Boolean(existing.blacklisted) || wantsBlacklisted;

    // Cannot update/replace CV of a blacklisted candidate; automatically keep blacklisted
    if (isCurrentlyBlacklisted && req.file) {
      safeUnlink(req.file.path);
      const reason =
        String(req.body.blacklistReason || "").trim() ||
        existing.blacklistReason ||
        "Policy violation";

      const autoUpdated = await Candidate.findOneAndUpdate(
        { _id: id, isActive: true },
        {
          $set: {
            blacklisted: true,
            blacklistReason: reason,
            stage: "Not Selected",
            updatedBy: req.user._id,
          },
        },
        { new: true }
      ).populate("positionId", "title department");

      return res.status(400).json({
        success: false,
        message:
          "Cannot update a blacklisted candidate's CV. Candidate is automatically blacklisted.",
        data: autoUpdated,
      });
    }

    const updates = { updatedBy: req.user._id };

    if (req.body.fullName !== undefined) {
      if (!String(req.body.fullName).trim()) {
        if (req.file?.path) safeUnlink(req.file.path);
        return res.status(400).json({ success: false, message: "Candidate name is required" });
      }
      updates.fullName = String(req.body.fullName).trim();
    }

    if (req.body.email !== undefined) {
      updates.email = String(req.body.email || "").trim().toLowerCase();
    }

    if (req.body.phone !== undefined) {
      updates.phone = String(req.body.phone || "").trim();
    }

    if (req.body.gender !== undefined) {
      updates.gender = ["Male", "Female", "Other"].includes(req.body.gender)
        ? req.body.gender
        : "";
    }

    if (req.body.department !== undefined) {
      updates.department = String(req.body.department || "").trim();
    }

    if (req.body.experienceYears !== undefined) {
      updates.experienceYears = Math.max(0, Number(req.body.experienceYears) || 0);
    }

    if (req.body.interviewedBefore !== undefined) {
      updates.interviewedBefore =
        req.body.interviewedBefore === true ||
        req.body.interviewedBefore === "true" ||
        req.body.interviewedBefore === "yes";
    }

    if (req.body.positionId !== undefined) {
      if (!req.body.positionId) {
        updates.positionId = null;
        updates.positionAppliedLabel =
          String(req.body.positionAppliedLabel || "").trim() || "Unlinked / Speculative";
      } else if (mongoose.Types.ObjectId.isValid(req.body.positionId)) {
        updates.positionId = req.body.positionId;
        const posDoc = await JobPosition.findById(req.body.positionId).select("title");
        updates.positionAppliedLabel =
          String(req.body.positionAppliedLabel || "").trim() ||
          posDoc?.title ||
          existing.positionAppliedLabel ||
          "";
      }
    } else if (req.body.positionAppliedLabel !== undefined) {
      updates.positionAppliedLabel = String(req.body.positionAppliedLabel).trim();
    }

    if (req.body.source !== undefined) {
      updates.source = String(req.body.source || "").trim() || "Online Test Portal";
    }

    if (req.body.stage !== undefined) {
      updates.stage = req.body.stage;
    }

    if (req.body.testScore !== undefined) {
      updates.testScore =
        req.body.testScore === null || String(req.body.testScore).trim() === ""
          ? null
          : Math.min(100, Math.max(0, Number(req.body.testScore)));
    }

    if (req.body.notes !== undefined) {
      updates.notes = String(req.body.notes || "").trim();
    }

    let previousCvPath = null;
    if (req.file) {
      const cvMeta = extractCvMeta(req.file);
      if (cvMeta?.error) {
        return res.status(400).json({ success: false, message: cvMeta.error });
      }
      previousCvPath = existing.cvFilePath;
      updates.cvFileName = cvMeta.cvFileName;
      updates.cvFileUrl = cvMeta.cvFileUrl;
      updates.cvFilePath = cvMeta.cvFilePath;
      updates.cvFileSize = cvMeta.cvFileSize;
    }

    if (req.body.blacklisted !== undefined || req.body.autoBlacklist !== undefined) {
      updates.blacklisted = wantsBlacklisted;
      if (wantsBlacklisted) {
        updates.blacklistReason =
          String(req.body.blacklistReason || "").trim() ||
          existing.blacklistReason ||
          "Policy violation";
        updates.stage = "Not Selected";
      } else if (req.body.blacklistReason !== undefined) {
        updates.blacklistReason = String(req.body.blacklistReason).trim();
      }
    } else if (req.body.blacklistReason !== undefined) {
      updates.blacklistReason = String(req.body.blacklistReason).trim();
    }

    const updated = await Candidate.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("positionId", "title department");

    if (previousCvPath && previousCvPath !== updated.cvFilePath) {
      safeUnlink(previousCvPath);
    }

    return res.json({ success: true, message: "Candidate updated", data: updated });
  } catch (error) {
    if (req.file?.path) safeUnlink(req.file.path);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid candidate ID" });
    }

    const deleted = await Candidate.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: { isActive: false, updatedBy: req.user._id } },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    return res.json({ success: true, message: "Candidate deleted", data: deleted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadCandidateCv = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid candidate ID" });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate || !candidate.isActive) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    const diskPath =
      candidate.cvFilePath ||
      (candidate.cvFileUrl
        ? path.join(process.cwd(), candidate.cvFileUrl.replace(/^\/+/, ""))
        : "");

    if (diskPath && fs.existsSync(diskPath)) {
      return res.download(diskPath, candidate.cvFileName || "CV.pdf");
    }

    return res.status(404).json({ success: false, message: "CV file not found on disk" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ONLINE TESTS & SUBMISSIONS
const listTestsAndSubmissions = async (_req, res) => {
  try {
    const [tests, submissions] = await Promise.all([
      OnlineTest.find({ isActive: true }).sort({ createdAt: 1 }),
      TestSubmission.find({ isActive: true }).sort({ createdAt: 1 }),
    ]);

    return res.json({
      success: true,
      data: { tests, submissions },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createTest = async (req, res) => {
  try {
    const {
      title,
      positionId = null,
      questionPaperId = null,
      status = "Active",
      candidatesTaken = 0,
      candidatesTotal = 0,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Test title is required" });
    }

    const created = await OnlineTest.create({
      title: String(title).trim(),
      positionId: positionId && mongoose.Types.ObjectId.isValid(positionId) ? positionId : null,
      questionPaperId:
        questionPaperId && mongoose.Types.ObjectId.isValid(questionPaperId)
          ? questionPaperId
          : null,
      status,
      candidatesTaken: Math.max(0, Number(candidatesTaken) || 0),
      candidatesTotal: Math.max(0, Number(candidatesTotal) || 0),
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: "Test created", data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createSubmission = async (req, res) => {
  try {
    const {
      testId = null,
      candidateId = null,
      candidateName,
      submittedDate = null,
      score = 0,
      answers = [],
    } = req.body;

    if (!candidateName?.trim()) {
      return res.status(400).json({ success: false, message: "Candidate name is required" });
    }

    const created = await TestSubmission.create({
      testId: testId && mongoose.Types.ObjectId.isValid(testId) ? testId : null,
      candidateId:
        candidateId && mongoose.Types.ObjectId.isValid(candidateId) ? candidateId : null,
      candidateName: String(candidateName).trim(),
      submittedDate: submittedDate ? new Date(submittedDate) : new Date(),
      score: Math.min(100, Math.max(0, Number(score) || 0)),
      answers: Array.isArray(answers) ? answers : [],
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: "Submission saved", data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// QUESTION PAPERS
const listQuestionPapers = async (_req, res) => {
  try {
    const papers = await QuestionPaper.find({ isActive: true }).sort({ createdAt: 1 });
    return res.json({ success: true, data: papers, count: papers.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createQuestionPaper = async (req, res) => {
  try {
    const {
      title,
      positionLabel = "All Positions",
      positionId = null,
      paperType = "Aptitude",
      questionsCountOverride = null,
      questions = [],
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Paper title is required" });
    }

    const created = await QuestionPaper.create({
      title: String(title).trim(),
      positionLabel: String(positionLabel || "All Positions").trim(),
      positionId: positionId && mongoose.Types.ObjectId.isValid(positionId) ? positionId : null,
      paperType: String(paperType || "Aptitude").trim(),
      questionsCountOverride:
        questionsCountOverride !== null && questionsCountOverride !== ""
          ? Number(questionsCountOverride)
          : null,
      questions: Array.isArray(questions) ? questions : [],
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: "Question paper created", data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// INTERVIEW SELECTIONS
const listInterviewSelections = async (_req, res) => {
  try {
    const list = await InterviewSelection.find({ isActive: true }).sort({ createdAt: 1 });
    return res.json({ success: true, data: list, count: list.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createInterviewSelection = async (req, res) => {
  try {
    const {
      candidateId = null,
      candidateName,
      designation,
      interviewDate,
      status = "Scheduled",
    } = req.body;

    if (!candidateName?.trim() || !designation?.trim() || !interviewDate) {
      return res
        .status(400)
        .json({ success: false, message: "Candidate name, designation, and date are required" });
    }

    const created = await InterviewSelection.create({
      candidateId:
        candidateId && mongoose.Types.ObjectId.isValid(candidateId) ? candidateId : null,
      candidateName: String(candidateName).trim(),
      designation: String(designation).trim(),
      interviewDate: new Date(interviewDate),
      status,
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: "Interview selection added", data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ONBOARDING HIRES
const listOnboardingHires = async (_req, res) => {
  try {
    const list = await OnboardingHire.find({ isActive: true }).sort({ createdAt: 1 });
    return res.json({ success: true, data: list, count: list.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createOnboardingHire = async (req, res) => {
  try {
    const {
      candidateId = null,
      employeeName,
      department,
      positionTitle = "",
      startDate,
      completedSteps = 3,
      totalSteps = 6,
      ndaStatus = "Signed",
      status = "In Progress",
    } = req.body;

    if (!employeeName?.trim() || !department?.trim() || !startDate) {
      return res
        .status(400)
        .json({ success: false, message: "Name, department, and start date are required" });
    }

    const created = await OnboardingHire.create({
      candidateId:
        candidateId && mongoose.Types.ObjectId.isValid(candidateId) ? candidateId : null,
      employeeName: String(employeeName).trim(),
      department: String(department).trim(),
      positionTitle: String(positionTitle || "").trim(),
      startDate: new Date(startDate),
      completedSteps: Math.max(0, Number(completedSteps) || 0),
      totalSteps: Math.max(1, Number(totalSteps) || 6),
      ndaStatus: ndaStatus === "Pending" ? "Pending" : "Signed",
      status,
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: "New hire added", data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateOnboardingHire = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid onboarding ID" });
    }

    const updates = {};
    if (req.body.completedSteps !== undefined) {
      updates.completedSteps = Math.max(0, Number(req.body.completedSteps) || 0);
    }
    if (req.body.totalSteps !== undefined) {
      updates.totalSteps = Math.max(1, Number(req.body.totalSteps) || 6);
    }
    if (req.body.ndaStatus !== undefined) {
      updates.ndaStatus = req.body.ndaStatus;
    }
    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }

    const updated = await OnboardingHire.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: updates },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Onboarding record not found" });
    }

    return res.json({ success: true, message: "Onboarding updated", data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getOverview,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  listCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
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
};