// src/services/crawlScheduler.service.js
const TenderSettings = require("../models/TenderSettings.model");
const Tender = require("../models/Tender.model");
const { User } = require("../models/User.model");
const { sendCrawlSummary } = require("../utils/mailer");
const { crawlAllSources } = require("./tenderCrawler.service");

/* ============================================================
 * MATCH HELPERS
 * ============================================================ */
function includesStr(list, value) {
  if (!Array.isArray(list) || !list.length || !value) return false;
  const v = String(value).toLowerCase().trim();
  return list.some((x) => String(x).toLowerCase().trim() === v);
}

function matchTenderToCriteria(tender, settings) {
  const matchedOn = [];

  // 🟢 টাইটেল, টেন্ডারার এবং অন্যান্য টেক্সট ফিল্ড একসাথে
  const text = [
    tender.title,
    tender.description,
    tender.tenderer,
    tender.sourceSite,
    tender.eligibility,
    tender.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  /* Sector text match */
  const sectorHits = (settings.sectors || []).filter((s) =>
    text.includes(String(s).toLowerCase()),
  );
  if (sectorHits.length) matchedOn.push(...sectorHits);

  /* Product line text match */
  const productHits = (settings.productLines || []).filter((p) =>
    text.includes(String(p).toLowerCase()),
  );
  if (productHits.length) matchedOn.push(...productHits);

  /* Tender type exact match */
  if (Array.isArray(settings.tenderTypes) && settings.tenderTypes.length) {
    const tenderTypeLower = String(tender.tenderType || "").toLowerCase().trim();
    const matchedType = settings.tenderTypes.find(
      (t) => String(t).toLowerCase().trim() === tenderTypeLower
    );
    if (matchedType) matchedOn.push(matchedType);
  }

  /* Value range */
  const value = Number(tender.tentativeBudget || tender.bidValue || 0);
  if (settings.valueMin != null && value < settings.valueMin) return [];
  if (settings.valueMax != null && value > settings.valueMax) return [];
  if (value > 0) matchedOn.push("In value range");

  /* Tender security range */
  const tsec = Number(tender.tenderSecurityAmount || 0);
  if (tsec > 0) {
    if (settings.securityMin != null && tsec < settings.securityMin) return [];
    if (settings.securityMax != null && tsec > settings.securityMax) return [];
    matchedOn.push("In security range");
  }

  /* Performance security range */
  const psec = Number(tender.performanceSecurityAmount || 0);
  if (psec > 0) {
    if (settings.performanceMin != null && psec < settings.performanceMin) return [];
    if (settings.performanceMax != null && psec > settings.performanceMax) return [];
    matchedOn.push("In perf. security range");
  }

  return matchedOn;
}

function deriveSource(tender) {
  if (!tender.tenderLink) return { sourceSite: "", sourceUrl: "" };
  try {
    const url = new URL(tender.tenderLink);
    return { sourceSite: url.hostname, sourceUrl: tender.tenderLink };
  } catch {
    return { sourceSite: "", sourceUrl: tender.tenderLink };
  }
}

/* ============================================================
 * RUN CRAWL
 * ============================================================ */
async function runCrawlInternal({ userId = null } = {}) {
  /* 1. Load settings */
  let settings = await TenderSettings.findOne();
  if (!settings) settings = await TenderSettings.create({});

  /* 2. Load recipients */
  let recipients = [];
  try {
    if (
      Array.isArray(settings.notificationRecipientIds) &&
      settings.notificationRecipientIds.length > 0
    ) {
      recipients = await User.find({
        _id: { $in: settings.notificationRecipientIds },
      })
        .select("email fullName")
        .lean();
    }
  } catch (err) {
    console.warn("[crawl] recipients lookup failed:", err.message);
  }

  /* 3. Crawl external sites */
  const crawlResults = await crawlAllSources({ delayMs: 1200 });
  const sitesChecked = crawlResults.length;

  let newFound = 0;
  const insertedIds = [];

  const siteMetaByName = new Map();
  for (const r of crawlResults) {
    if (!r || !r.source) continue;
    siteMetaByName.set(r.source, {
      effectiveSectionSelector: r.effectiveSectionSelector || null,
      effectiveMode: r.effectiveMode || null,
      fellBack: !!r.fellBack,
    });
  }

  for (const siteResult of crawlResults) {
    if (!siteResult.ok) continue;

    for (const t of siteResult.tenders) {
      newFound++;

      /* 🟢 ডুপ্লিকেট চেক */
      const exists = await Tender.findOne({
        title: t.title,
        sourceSite: t.sourceSite || "Auto-discovered",
      })
        .select("_id")
        .lean();

      if (exists) continue;

      /* Insert auto-discovered tender */
      try {
        const created = await Tender.create({
          tenderer: t.sourceSite || "Auto-discovered",
          sourceSite: t.sourceSite || "Auto-discovered",
          title: t.title,
          tenderLink: t.tenderLink,
          stage: "potential",
          draft: false,
          autoDiscovered: true,
          tenderType: "eGP",
          tentativeBudget: t.tentativeBudget || 0,
          tenderSecurityAmount: t.tenderSecurityAmount || 0,
          recordedBy: "Auto-discovered",
          owner: userId,
          createdBy: userId,
          updatedBy: userId,
          note: "Auto-discovered by crawler",
        });
        insertedIds.push(created._id);
      } catch (err) {
        console.warn("[crawl] insert failed:", err.message);
      }
    }
  }

  /* ============================================================
   * 4. MATCH AGAINST CRITERIA (🟢 FIXED: ALL AUTO-DISCOVERED TENDERS)
   * ============================================================ */
  // নতুন টেন্ডার না পেলেও, ডেটাবেসে আগের থাকা সব অটো-ডিসকভারড টেন্ডার চেক করুন
  const pool = await Tender.find({ 
    autoDiscovered: true,
    stage: "potential" 
  }).lean();

  const matchedResults = [];
  for (const t of pool) {
    const matchedOn = matchTenderToCriteria(t, settings);

    // 🟢 ক্রাইটেরিয়া চেক
    const hasAnyCriteria =
      (settings.sectors?.length || 0) > 0 ||
      (settings.productLines?.length || 0) > 0 ||
      (settings.tenderTypes?.length || 0) > 0 ||
      settings.valueMin != null ||
      settings.valueMax != null ||
      settings.securityMin != null ||
      settings.securityMax != null;

    // যদি কোনো ক্রাইটেরিয়া সেট না থাকে, তবে সব টেন্ডার ম্যাচ হবে
    if (hasAnyCriteria && matchedOn.length === 0) continue;

    const { sourceSite, sourceUrl } = deriveSource(t);

    matchedResults.push({
      tenderId: t._id,
      title: t.title || "(untitled)",
      tenderer: t.tenderer || "",
      sourceSite: t.sourceSite || sourceSite,
      sourceUrl,
      budget: Number(t.tentativeBudget || t.bidValue || 0),
      securityAmount: Number(t.tenderSecurityAmount || 0),
      publishedAt: t.createdAt || null,
      matchedOn,
    });
  }

  /* 5. Timestamp + summary */
  const startedAt = new Date();
  const at = startedAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  settings.lastCrawl = {
    at,
    sitesChecked,
    newFound,
    matched: matchedResults.length,
    ranAt: startedAt,
    triggeredBy: userId,
    results: matchedResults,
  };
  await settings.save();

  /* 6. Email recipients */
  let emailed = 0;
  if (recipients.length > 0 && matchedResults.length > 0) {
    try {
      const info = await sendCrawlSummary({
        to: recipients.map((r) => r.email),
        summary: {
          sitesChecked,
          newFound,
          matched: matchedResults.length,
        },
        criteria: {
          sectors: settings.sectors,
          productLines: settings.productLines,
          valueMin: settings.valueMin,
          valueMax: settings.valueMax,
        },
        ranAt: at,
      });
      emailed = info?.accepted?.length ?? recipients.length;
    } catch (mailErr) {
      console.warn("[crawl] email failed:", mailErr.message);
    }
  }

  console.log(
    `[crawl] ✅ sites=${sitesChecked} found=${newFound} inserted=${insertedIds.length} matched=${matchedResults.length} emailed=${emailed}`,
  );

  return {
    at,
    sitesChecked,
    newFound,
    matched: matchedResults.length,
    inserted: insertedIds.length,
    emailed,
    results: matchedResults,
    siteScopes: Array.from(siteMetaByName.entries()).map(([name, meta]) => ({
      name,
      ...meta,
    })),
  };
}

module.exports = {
  runCrawlInternal,
  matchTenderToCriteria,
  deriveSource,
  includesStr,
};