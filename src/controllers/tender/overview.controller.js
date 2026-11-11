// src/controllers/tender/overview.controller.js
const Tender = require("../../models/Tender.model");
const TenderChatMessage = require("../../models/TenderChatMessage.model");

/* ============================================================
 * COMBINED OVERVIEW — one request returns everything the dashboard needs
 * GET /api/v1/tenders/overview
 * ============================================================ */
const overview = async (req, res) => {
  try {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 86400000);
    const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    /* Fire every query in parallel — one network round trip total */
    const [
      stageAgg,
      winLossAgg,
      bidValueAgg,
      upcomingRows,
      performanceAgg,
      recentTenders,
      recentChat,
    ] = await Promise.all([
      /* 1. Counts + budget per stage (single aggregation) */
      Tender.aggregate([
        { $match: { draft: { $ne: true } } },
        {
          $group: {
            _id: "$stage",
            count: { $sum: 1 },
            total: { $sum: "$tentativeBudget" },
          },
        },
      ]),

      /* 2. Won / lost counts for the last 12 months */
      Tender.aggregate([
        {
          $match: {
            draft: { $ne: true },
            stage: { $in: ["won", "lost"] },
            updatedAt: { $gte: oneYearAgo },
          },
        },
        { $group: { _id: "$stage", count: { $sum: 1 } } },
      ]),

      /* 3. Total bid value of submitted tenders */
      Tender.aggregate([
        { $match: { draft: { $ne: true }, stage: "submitted" } },
        { $group: { _id: null, total: { $sum: "$bidValue" } } },
      ]),

      /* 4. Upcoming deadlines (next 30 days) */
      Tender.find({
        draft: { $ne: true },
        stage: { $in: ["potential", "active"] },
        lastDateOfSubmission: { $gte: now, $lte: thirtyDaysLater },
      })
        .select(
          "tenderer title stage lastDateOfSubmission tentativeBudget currency",
        )
        .sort({ lastDateOfSubmission: 1 })
        .limit(10)
        .lean(),

      /* 5. Performance — won vs lost per month (last 6 months) */
      Tender.aggregate([
        {
          $match: {
            draft: { $ne: true },
            stage: { $in: ["won", "lost"] },
            updatedAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              stage: "$stage",
              year: { $year: "$updatedAt" },
              month: { $month: "$updatedAt" },
            },
            count: { $sum: 1 },
          },
        },
      ]),

      /* 6. Recent activity — latest tenders */
      Tender.find({ draft: { $ne: true } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("tenderer title stage updatedAt advertisementFile")
        .lean(),

      /* 7. Recent chat messages (top 5) for the activity feed */
      TenderChatMessage.find({ deleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("tenderId senderName senderRole body createdAt")
        .populate("tenderId", "tenderer title")
        .lean(),
    ]);

    /* ---------- Stage counts ---------- */
    const byStage = stageAgg.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    const totalTenders = Object.values(byStage).reduce((a, b) => a + b, 0);

    /* ---------- Win rate ---------- */
    const wonCount = winLossAgg.find((w) => w._id === "won")?.count ?? 0;
    const lostCount = winLossAgg.find((w) => w._id === "lost")?.count ?? 0;
    const winRate =
      wonCount + lostCount > 0
        ? Math.round((wonCount / (wonCount + lostCount)) * 100)
        : 0;

    const totalBidValue = bidValueAgg[0]?.total ?? 0;

    /* ---------- Upcoming deadlines (shape for the client) ---------- */
    const upcoming = upcomingRows.map((t) => ({
      id: String(t._id),
      tenderer: t.tenderer,
      title: t.title,
      daysLeft: Math.max(
        0,
        Math.ceil(
          (new Date(t.lastDateOfSubmission).getTime() - Date.now()) / 86400000,
        ),
      ),
      value: t.tentativeBudget
        ? `৳${t.tentativeBudget.toLocaleString("en-IN")}`
        : "—",
    }));

    /* ---------- Performance chart (last 6 months) ---------- */
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString("en-US", { month: "short" }),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }

    const perfData = months.map((m) => {
      const won =
        performanceAgg.find(
          (a) =>
            a._id.stage === "won" &&
            a._id.year === m.year &&
            a._id.month === m.month,
        )?.count ?? 0;
      const lost =
        performanceAgg.find(
          (a) =>
            a._id.stage === "lost" &&
            a._id.year === m.year &&
            a._id.month === m.month,
        )?.count ?? 0;
      return { month: m.label, won, lost };
    });

    /* ---------- Recent activity feed ---------- */
    const stageActivity = recentTenders.map((t) => {
      let kind = "discussed";
      let message = `${t.title} — under discussion`;

      if (t.stage === "submitted") {
        kind = "submitted";
        message = `${t.title} — submitted, awaiting result`;
      } else if (t.stage === "won") {
        kind = "won";
        message = `${t.title} — won`;
      } else if (t.stage === "lost") {
        kind = "lost";
        message = `${t.title} — lost`;
      } else if (t.advertisementFile) {
        kind = "uploaded";
        message = `${t.title} — advertisement uploaded`;
      }

      return {
        id: String(t._id),
        kind,
        tenderer: t.tenderer,
        message,
        timeAgo: timeAgo(t.updatedAt),
      };
    });

    const chatActivity = recentChat.map((c) => ({
      id: String(c._id),
      kind: "chat",
      tenderer: c.tenderId?.tenderer || "",
      message: `${c.senderName}: ${(c.body || "sent an attachment").slice(0, 60)}`,
      timeAgo: timeAgo(c.createdAt),
    }));

    /* Merge + sort by recency (approximated from timeAgo string) */
    const activity = [...chatActivity, ...stageActivity]
      .sort((a, b) => timeAgoScore(b.timeAgo) - timeAgoScore(a.timeAgo))
      .slice(0, 10);

    /* ---------- Respond with everything ---------- */
    res.json({
      success: true,
      data: {
        /* Legacy shape — components that read `.stats` and `.pipeline` keep working */
        stats: [
          {
            label: "Total Tenders (FY26)",
            value: String(totalTenders),
            hint: "Across all stages",
          },
          {
            label: "Currently Active",
            value: String(byStage.active ?? 0),
            hint: "Docs in preparation",
          },
          {
            label: "Awaiting Result",
            value: String(byStage.submitted ?? 0),
            hint: "Submitted, pending decision",
          },
          {
            label: "Win Rate (FY26)",
            value: `${winRate}%`,
            hint: `${wonCount} Won · ${lostCount} Lost`,
          },
          {
            label: "Total Bid Value",
            value: `৳${totalBidValue.toLocaleString("en-IN")}`,
            hint: "Submitted this FY",
            highlighted: true,
          },
        ],
        pipeline: [
          {
            id: "potential",
            label: "Potential",
            count: byStage.potential ?? 0,
            color: "bg-slate-400",
            hint: "Under review",
          },
          {
            id: "active",
            label: "Active",
            count: byStage.active ?? 0,
            color: "bg-indigo-500",
            hint: "In preparation",
          },
          {
            id: "submitted",
            label: "Submitted",
            count: byStage.submitted ?? 0,
            color: "bg-amber-500",
            hint: "Awaiting result",
          },
          {
            id: "won",
            label: "Won",
            count: wonCount,
            color: "bg-emerald-500",
            hint: "This FY",
          },
          {
            id: "lost",
            label: "Lost",
            count: lostCount,
            color: "bg-rose-500",
            hint: "This FY",
          },
        ],

        /* New sub-objects — used by the combined hook */
        upcoming,
        performance: { data: perfData, winRate },
        recentActivity: activity,
      },
    });
  } catch (error) {
    console.error("overview error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * Individual endpoints — kept for backwards compatibility
 * ============================================================ */

const upcomingDeadlines = async (_req, res) => {
  try {
    const now = new Date();
    const later = new Date(now.getTime() + 30 * 86400000);

    const rows = await Tender.find({
      draft: { $ne: true },
      stage: { $in: ["potential", "active"] },
      lastDateOfSubmission: { $gte: now, $lte: later },
    })
      .select(
        "tenderer title stage lastDateOfSubmission tentativeBudget currency",
      )
      .sort({ lastDateOfSubmission: 1 })
      .limit(10)
      .lean();

    const data = rows.map((t) => ({
      id: String(t._id),
      tenderer: t.tenderer,
      title: t.title,
      daysLeft: Math.max(
        0,
        Math.ceil(
          (new Date(t.lastDateOfSubmission).getTime() - Date.now()) / 86400000,
        ),
      ),
      value: t.tentativeBudget
        ? `৳${t.tentativeBudget.toLocaleString("en-IN")}`
        : "—",
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("upcomingDeadlines error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const performance = async (_req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString("en-US", { month: "short" }),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }

    const agg = await Tender.aggregate([
      {
        $match: {
          draft: { $ne: true },
          stage: { $in: ["won", "lost"] },
          updatedAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            stage: "$stage",
            year: { $year: "$updatedAt" },
            month: { $month: "$updatedAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const data = months.map((m) => {
      const won =
        agg.find(
          (a) =>
            a._id.stage === "won" &&
            a._id.year === m.year &&
            a._id.month === m.month,
        )?.count ?? 0;
      const lost =
        agg.find(
          (a) =>
            a._id.stage === "lost" &&
            a._id.year === m.year &&
            a._id.month === m.month,
        )?.count ?? 0;
      return { month: m.label, won, lost };
    });

    const totalWon = data.reduce((s, d) => s + d.won, 0);
    const totalLost = data.reduce((s, d) => s + d.lost, 0);
    const winRate =
      totalWon + totalLost > 0
        ? Math.round((totalWon / (totalWon + totalLost)) * 100)
        : 0;

    res.json({ success: true, data: { data, winRate } });
  } catch (error) {
    console.error("performance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const recentActivity = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const [tenders, chats] = await Promise.all([
      Tender.find({ draft: { $ne: true } })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select("tenderer title stage updatedAt advertisementFile")
        .lean(),
      TenderChatMessage.find({ deleted: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("tenderId senderName senderRole body createdAt")
        .populate("tenderId", "tenderer title")
        .lean(),
    ]);

    const stageItems = tenders.map((t) => {
      let kind = "discussed";
      let message = `${t.title} — under discussion`;

      if (t.stage === "submitted") {
        kind = "submitted";
        message = `${t.title} — submitted, awaiting result`;
      } else if (t.stage === "won") {
        kind = "won";
        message = `${t.title} — won`;
      } else if (t.stage === "lost") {
        kind = "lost";
        message = `${t.title} — lost`;
      } else if (t.advertisementFile) {
        kind = "uploaded";
        message = `${t.title} — advertisement uploaded`;
      }

      return {
        id: String(t._id),
        kind,
        tenderer: t.tenderer,
        message,
        timeAgo: timeAgo(t.updatedAt),
      };
    });

    const chatItems = chats.map((c) => ({
      id: String(c._id),
      kind: "chat",
      tenderer: c.tenderId?.tenderer || "",
      message: `${c.senderName}: ${(c.body || "sent an attachment").slice(0, 60)}`,
      timeAgo: timeAgo(c.createdAt),
    }));

    const items = [...chatItems, ...stageItems]
      .sort((a, b) => timeAgoScore(b.timeAgo) - timeAgoScore(a.timeAgo))
      .slice(0, limit);

    res.json({ success: true, data: items });
  } catch (error) {
    console.error("recentActivity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * HELPERS
 * ============================================================ */

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/* Rough sort key so we can interleave stage + chat activity */
function timeAgoScore(label) {
  if (label === "just now") return 0;
  const m = /^(\d+)([mhd]) ago$/.exec(label);
  if (!m) return 99999; // a date string — sort last
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "m") return n;
  if (unit === "h") return n * 60;
  return n * 60 * 24;
}

module.exports = { overview, upcomingDeadlines, performance, recentActivity };