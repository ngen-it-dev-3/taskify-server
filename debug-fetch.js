// debug-fetch.js
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");

(async () => {
  try {
    const URL = "https://www.eprocure.gov.bd/resources/common/AllTenders.jsp?n=t";

    const { data } = await axios.get(URL, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 20000,
      maxRedirects: 5,
    });

    console.log("✅ Fetched", data.length, "bytes");

    const $ = cheerio.load(data);

    console.log("\n--- All tables on the page ---");
    $("table").each((i, el) => {
      const id = $(el).attr("id") || "";
      const cls = $(el).attr("class") || "";
      const rows = $(el).find("tr").length;
      console.log(`  [${i}] id="${id}" class="${cls}" rows=${rows}`);
    });

    console.log("\n--- Key counts ---");
    console.log("#resultTable count:", $("#resultTable").length);
    console.log("#resultTable tbody tr:", $("#resultTable tbody tr").length);
    console.log("Any tbody tr:", $("tbody tr").length);
    console.log("Any tr:", $("tr").length);

    console.log("\n--- Iframes on the page ---");
    $("iframe").each((i, el) => {
      console.log(`  iframe[${i}] src="${$(el).attr("src") || ""}"`);
    });

    console.log("\n--- First 5 rows found ---");
    $("tbody tr")
      .slice(0, 5)
      .each((i, el) => {
        const $row = $(el);
        const firstCell = $row.find("td").first().text().trim().slice(0, 40);
        const secondCell = $row.find("td").eq(1).text().trim().slice(0, 40);
        console.log(`  Row ${i}: "${firstCell}" | "${secondCell}"`);
      });

    /* Save raw HTML for inspection */
    const fs = require("fs");
    fs.writeFileSync("debug-output.html", data);
    console.log("\n📄 Raw HTML saved to debug-output.html");
  } catch (e) {
    console.error("❌ Fetch failed:", e.message);
    if (e.response) {
      console.error("   Status:", e.response.status);
      console.error("   Redirected to:", e.response.headers?.location);
    }
  }
})();