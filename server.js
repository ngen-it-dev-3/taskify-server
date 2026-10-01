// server.js
// ==================== DNS OVERRIDE FOR MONGODB SRV ====================
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

/* ---- Core dependencies ---- */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const http = require("http");
const cron = require("node-cron");

dotenv.config();

const app = express();
const server = http.createServer(app);

// ==================== CRON IMPORTS (TOP OF FILE) ====================
const TenderSettings = require("./src/models/TenderSettings.model");
const { runCrawlInternal } = require("./src/services/crawlScheduler.service");

// ==================== SOCKET.IO ====================
const { initializeSocket } = require("./src/socket/index");
const io = initializeSocket(server);
app.set("io", io);

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 1000,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
  skip: (req) => {
    if (process.env.NODE_ENV === "development") {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    }
    return false;
  },
});

// ==================== MIDDLEWARE ====================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:3001",
        "https://taskify-frontend-alpha.vercel.app",
        "https://taskify-server-5gat.onrender.com",
        undefined,
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Request-ID",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 600,
  }),
);

app.options("*", cors());

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(limiter);

// ==================== STATIC FILES ====================
const uploadsPath = path.join(__dirname, "uploads");
console.log(`📁 Uploads directory: ${uploadsPath}`);

const directories = [
  { path: uploadsPath, name: "uploads" },
  { path: path.join(uploadsPath, "tasks"), name: "tasks" },
  { path: path.join(uploadsPath, "avatars"), name: "avatars" },
  { path: path.join(uploadsPath, "signatures"), name: "signatures" },
  { path: path.join(uploadsPath, "voice"), name: "voice" },
  { path: path.join(uploadsPath, "support"), name: "support" },
  { path: path.join(uploadsPath, "backups"), name: "backups" },
  { path: path.join(uploadsPath, "channels"), name: "channels" },
  { path: path.join(uploadsPath, "tenders"), name: "tenders" },
];

for (const dir of directories) {
  if (!fs.existsSync(dir.path)) {
    fs.mkdirSync(dir.path, { recursive: true });
    console.log(`📁 Created ${dir.name} directory`);
  }
}

app.use(
  "/uploads",
  express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".webm": "audio/webm",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
      };
      if (mimeTypes[ext]) {
        res.setHeader("Content-Type", mimeTypes[ext]);
      }
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
  }),
);

// ==================== TEST ENDPOINT ====================
app.get("/test-uploads", (req, res) => {
  try {
    const tasksPath = path.join(uploadsPath, "tasks");
    const files = fs.existsSync(tasksPath) ? fs.readdirSync(tasksPath) : [];
    res.json({
      success: true,
      uploadsPath,
      tasksPath,
      filesCount: files.length,
      files: files.slice(0, 20),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ROUTES ====================
const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const departmentRoutes = require("./src/routes/department.routes");
const taskRoutes = require("./src/routes/task.routes");
const projectRoutes = require("./src/routes/project.routes");
const resourceRoutes = require("./src/routes/resource.routes");
const templateRoutes = require("./src/routes/template.routes");
const roleRoutes = require("./src/routes/role.routes");
const notificationRoutes = require("./src/routes/notification.routes");
const performanceRoutes = require("./src/routes/performance.routes");
const aiRoutes = require("./src/routes/ai.routes");
const reportRoutes = require("./src/routes/report.routes");
const leaveRoutes = require("./src/routes/leave.routes");
const teamRoutes = require("./src/routes/team.routes");
const attendanceRoutes = require("./src/routes/attendance.routes");
const onboardingRoutes = require("./src/routes/onboarding.routes");
const workloadRoutes = require("./src/routes/workload.routes");
const kpiRoutes = require("./src/routes/kpi.routes");
const kpiAnalyticsRoutes = require("./src/routes/kpi.analytics.routes");
const settingRoutes = require("./src/routes/setting.routes");
const auditLogRoutes = require("./src/routes/auditLog.routes");
const backupRoutes = require("./src/routes/backup.routes");
const supportTicketRoutes = require("./src/routes/supportTicket.routes");
const billingRoutes = require("./src/routes/billing.routes");
const systemStatusRoutes = require("./src/routes/systemStatus.routes");
const { authenticate, requireRole } = require("./src/middleware/auth.middleware");
const pricingPlanRoutes = require("./src/routes/pricingPlan.routes");
const timerRoutes = require("./src/routes/timer.routes");
const feedbackRoutes = require("./src/routes/feedback.routes");
const expenseRoutes = require("./src/routes/expense.routes");

const channelRoutes = require("./src/routes/channel.routes");
const messageRoutes = require("./src/routes/message.routes");
const voiceRoutes = require("./src/routes/voice.routes");
const tenderRoutes = require("./src/routes/tender.routes");
const rfqRoutes = require('./src/routes/rfq/rfq.routes');
const quotationRoutes = require('./src/routes/quotation/quotation.routes');
const salesCrmRoutes = require('./src/routes/salesCrm/salesCrm.routes');
const onlineCrmRoutes = require('./src/routes/onlineCrm/onlineCrm.routes');
const dmarRoutes = require('./src/routes/dmr/dmar.routes');
const client360Routes = require('./src/routes/client360/client360.routes');
const salesOrderRoutes = require('./src/routes/salesOrder/salesOrder.routes');


app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/departments", departmentRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1/resources", resourceRoutes);
app.use("/api/v1/templates", templateRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/performance", performanceRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/leaves", leaveRoutes);
app.use("/api/v1/teams", teamRoutes);
app.use("/api/v1/attendance", attendanceRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);
app.use("/api/v1/workload", workloadRoutes);
app.use("/api/v1/kpi", kpiRoutes);
app.use("/api/v1/kpi-analytics", kpiAnalyticsRoutes);
app.use("/api/v1/settings", settingRoutes);
app.use("/api/v1/audit-logs", auditLogRoutes);
app.use("/api/v1/backup", backupRoutes);
app.use("/api/v1/support/tickets", supportTicketRoutes);
app.use("/api/v1/system", systemStatusRoutes);
app.use("/api/v1/billing", billingRoutes);
app.use("/api/v1/pricing-plans", pricingPlanRoutes);
app.use("/api/v1/timer", timerRoutes);
app.use("/api/v1/feedback", feedbackRoutes);
app.use("/api/v1/channels", channelRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/voice", voiceRoutes);
app.use("/api/v1/expenses", expenseRoutes);
app.use("/api/v1/tenders", tenderRoutes);
app.use('/api/v1/crm/rfq', rfqRoutes);
app.use('/api/v1/crm/quotation', quotationRoutes);
app.use('/api/v1/sales-crm', salesCrmRoutes); 
app.use('/api/v1/online-crm', onlineCrmRoutes);
app.use('/api/v1/dmar', dmarRoutes);
app.use('/api/v1/clients', client360Routes);
app.use('/api/v1/sales-orders', salesOrderRoutes);



// ==================== HEALTH ====================
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    socketio: io ? "Initialized" : "Not initialized",
  });
});

// ==================== ROOT ====================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Enterprise Task Management API",
    version: "1.0.0",
  });
});

// ==================== DEBUG ====================
const { User } = require("./src/models/User.model");

app.get(
  "/api/debug/users",
  authenticate,
  requireRole("super_admin", "admin"),
  async (req, res) => {
    try {
      const users = await User.find().select("email fullName role");
      res.json({ success: true, data: users, count: users.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

// ==================== 404 ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// ==================== GLOBAL ERROR ====================
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ==================== DATABASE ====================
const connectDB = async (retries = 5, delay = 5000) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    if (retries > 0) {
      console.log(`Retrying in ${delay / 1000}s... (${retries} left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectDB(retries - 1, delay);
    }
    return false;
  }
};

// ==================== CRON (defined as function, not executed here) ====================
let lastRunKey = "";

function startCrawlCron() {
  cron.schedule("* * * * *", async () => {
    try {
      const settings = await TenderSettings.findOne().lean();
      const target = settings?.crawlTime || "06:00";
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const current = `${hh}:${mm}`;

      if (current !== target) return;
      if (lastRunKey === current) return;
      lastRunKey = current;

      console.log(`[cron] running scheduled tender crawl at ${current}`);
      const result = await runCrawlInternal({ userId: null });
      console.log(
        `[cron] done — sites=${result.sitesChecked} new=${result.newFound} matched=${result.matched}`,
      );
    } catch (err) {
      console.error("[cron] crawl failed:", err.message);
    }
  });
  console.log("✅ Cron scheduler started (daily tender crawl)");
}

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("         ENTERPRISE TASK MANAGEMENT SYSTEM");
  console.log("═══════════════════════════════════════════════════════════");

  const dbConnected = await connectDB();

  if (!dbConnected) {
    console.log("\n⚠️  Server starting without database connection");
  }

  console.log(`\n📁 Uploads directory: ${uploadsPath}`);
  console.log(`📁 Uploads exists: ${fs.existsSync(uploadsPath)}`);

  /* Start cron ONLY after DB connected */
  if (dbConnected) {
    startCrawlCron();
  } else {
    console.warn("⚠️  Cron skipped (no DB)");
  }

  server.listen(PORT, () => {
    console.log(`\n📡 Server:          http://localhost:${PORT}`);
    console.log(`🌍 Environment:     ${process.env.NODE_ENV || "development"}`);
    console.log(`💾 Database:        ${dbConnected ? "Connected ✅" : "Disconnected ⚠️"}`);
    console.log(`📁 Static files:    /uploads`);
    console.log(`🔌 Socket.io:       Initialized ✅`);
    console.log("\n═══════════════════════════════════════════════════════════\n");

    try {
      const { startScheduledJobs } = require("./src/services/notification.service");
      startScheduledJobs();
      console.log("✅ Notification scheduled jobs started");
    } catch (error) {
      console.error("⚠️ Failed to start scheduled jobs:", error.message);
    }
  });
};

// ==================== GRACEFUL SHUTDOWN ====================
const gracefulShutdown = async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('📦 MongoDB connection closed');
  }
  if (io) {
    await io.close();
    console.log('🔌 Socket.io closed');
  }

  // ⭐ Close puppeteer
  try {
    const { closePdfBrowser } = require('./src/utils/quotationPdf');
    await closePdfBrowser();
    console.log('📄 PDF browser closed');
  } catch { }

  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

startServer();