#!/usr/bin/env node

const SOURCE_URL = "https://live-tennis.eu/en/atp-schedule";
const FALLBACK_URLS = [
  "https://r.jina.ai/http://live-tennis.eu/en/atp-schedule",
  "https://r.jina.ai/http://https://live-tennis.eu/en/atp-schedule",
];
const SCRAPINGBEE_BASE_URL = "https://app.scrapingbee.com/api/v1/";

const IOC3_TO_ISO2 = {
  ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BIH: "BA", BOL: "BO", BRA: "BR", BUL: "BG", CAN: "CA",
  CHI: "CL", CHN: "CN", COL: "CO", CRO: "HR", CZE: "CZ", DEN: "DK", ESP: "ES", EST: "EE", FIN: "FI",
  FRA: "FR", GBR: "GB", GEO: "GE", GER: "DE", GRE: "GR", HKG: "HK", HUN: "HU", ITA: "IT", JPN: "JP",
  KAZ: "KZ", LTU: "LT", LUX: "LU", MON: "MC", NED: "NL", NOR: "NO", PAR: "PY", PER: "PE", POL: "PL",
  POR: "PT", RSA: "ZA", RUS: "RU", SRB: "RS", SUI: "CH", SVK: "SK", SWE: "SE", TUN: "TN", TWN: "TW",
  UKR: "UA", USA: "US",
};

function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

function mondayDates(count = 4) {
  const dates = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const offset = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + offset);

  for (let i = 0; i < count; i += 1) {
    const next = new Date(d);
    next.setDate(d.getDate() + i * 7);
    dates.push(next);
  }
  return dates;
}

function formatHeaderDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseDateHeader(value) {
  const text = value.replace(/\./g, "").trim();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCell(v) {
  return v.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeTournamentName(name) {
  return normalizeCell(name);
}

function parseMarkdownTable(text) {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find((line) => line.includes("| # | Player | Age | Ctry |"));
  if (!headerLine) return null;

  const headerCells = headerLine
    .split("|")
    .slice(1, -1)
    .map((v) => v.trim());
  const dateHeaders = headerCells.slice(4);

  const tableStart = lines.findIndex((line) => line.includes("| # | Player | Age | Ctry |"));
  const tableLines = lines.slice(tableStart + 1);

  const rows = [];
  for (const line of tableLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.includes("---")) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map(normalizeCell)
      .filter((_, idx, arr) => idx < arr.length);

    if (cells.length < 4) continue;
    if (!/^\d+$/.test(cells[0])) continue;

    rows.push({
      rank: Number(cells[0]),
      name: cells[1],
      age: Number(cells[2]),
      country3: cells[3],
      rawScheduleCells: cells.slice(4),
    });
  }

  return { dateHeaders, rows };
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function unwrapJsonBody(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.body === "string") return parsed.body;
      if (typeof parsed.html === "string") return parsed.html;
      if (typeof parsed.content === "string") return parsed.content;
      if (parsed.data && typeof parsed.data === "object") {
        if (typeof parsed.data.body === "string") return parsed.data.body;
        if (typeof parsed.data.html === "string") return parsed.data.html;
        if (typeof parsed.data.content === "string") return parsed.data.content;
      }
    }
  } catch {
    return text;
  }

  return text;
}

function parseHtmlTable(text) {
  const tableMatches = text.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tableMatches) {
    const flat = normalizeCell(table).toLowerCase();
    if (!flat.includes("player") || !flat.includes("ctry") || !flat.includes("age")) continue;

    const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rowMatches.length < 2) continue;

    const readCells = (row) => {
      const cells = [];
      const parts = row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [];
      for (const part of parts) {
        const value = decodeHtmlEntities(normalizeCell(part));
        cells.push(value);
      }
      return cells;
    };

    const headers = rowMatches.map((row) => readCells(row));
    const headerIndex = headers.findIndex((header) => {
      const lower = header.map((h) => h.toLowerCase());
      return lower.includes("#") && lower.includes("player") && lower.includes("age") && lower.includes("ctry");
    });
    if (headerIndex < 0) continue;

    const header = headers[headerIndex];
    const hashIndex = header.findIndex((h) => h === "#");
    const playerIndex = header.findIndex((h) => h.toLowerCase() === "player");
    const ageIndex = header.findIndex((h) => h.toLowerCase() === "age");
    const ctryIndex = header.findIndex((h) => h.toLowerCase() === "ctry");
    if ([hashIndex, playerIndex, ageIndex, ctryIndex].some((v) => v < 0)) continue;

    const dateHeaders = header.slice(ctryIndex + 1);
    const rows = [];
    for (const row of rowMatches.slice(headerIndex + 1)) {
      const cells = readCells(row);
      if (cells.length <= ctryIndex) continue;
      if (!/^\d+$/.test(cells[hashIndex] || "")) continue;

      rows.push({
        rank: Number(cells[hashIndex]),
        name: cells[playerIndex] || "",
        age: Number(cells[ageIndex]) || null,
        country3: cells[ctryIndex] || "",
        rawScheduleCells: cells.slice(ctryIndex + 1).map((v) => v || ""),
      });
    }

    if (rows.length > 0 && dateHeaders.length > 0) {
      return { dateHeaders, rows };
    }
  }
  return null;
}

function buildTournamentColumnHints(parsedRows, dateColumnCount) {
  const hintByTournament = new Map();

  for (const row of parsedRows) {
    row.rawScheduleCells.forEach((rawValue, observedIndex) => {
      const name = normalizeTournamentName(rawValue);
      if (!name) return;

      const current = hintByTournament.get(name);
      if (current === undefined || observedIndex > current) {
        hintByTournament.set(name, Math.min(observedIndex, dateColumnCount - 1));
      }
    });
  }

  return hintByTournament;
}

function rebuildScheduleColumns(rawScheduleCells, hintByTournament, dateColumnCount) {
  const rebuilt = Array.from({ length: dateColumnCount }, () => "");
  const occupied = new Set();
  let cursor = 0;

  for (const rawValue of rawScheduleCells) {
    const name = normalizeTournamentName(rawValue);
    if (!name) continue;

    let target = hintByTournament.get(name) ?? cursor;
    target = Math.max(target, cursor);
    target = Math.min(target, dateColumnCount - 1);

    while (occupied.has(target) && target < dateColumnCount - 1) target += 1;
    while (occupied.has(target) && target > cursor) target -= 1;
    if (occupied.has(target)) continue;

    rebuilt[target] = name;
    occupied.add(target);
    cursor = Math.min(target + 1, dateColumnCount - 1);
  }

  return rebuilt;
}

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ATPTrackerBot/1.0)",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildScrapingBeeUrl() {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    url: SOURCE_URL,
    render_js: "true",
    block_resources: "false",
    premium_proxy: "true",
    country_code: "us",
    wait: "2500",
  });

  return `${SCRAPINGBEE_BASE_URL}?${params.toString()}`;
}

async function loadSourceText() {
  const sourceFilePath = process.env.SOURCE_TEXT_FILE;
  if (sourceFilePath) {
    const fs = await import("node:fs/promises");
    return fs.readFile(sourceFilePath, "utf-8");
  }

  const scrapingBeeUrl = buildScrapingBeeUrl();
  const candidates = [
    ...(scrapingBeeUrl ? [{ label: "scrapingbee", url: scrapingBeeUrl }] : []),
    { label: "direct-source", url: SOURCE_URL },
    ...FALLBACK_URLS.map((url, idx) => ({ label: `fallback-${idx + 1}`, url })),
  ];
  const failures = [];

  for (const candidate of candidates) {
    try {
      const text = await fetchWithTimeout(candidate.url, 30000);
      if (text && text.trim()) {
        console.log(`Fetched source from ${candidate.label}`);
        return text;
      }
      failures.push(`${candidate.label}: empty response`);
    } catch (error) {
      failures.push(`${candidate.label}: ${error.message}`);
    }
  }

  throw new Error(`All source fetch attempts failed. ${failures.join(" | ")}`);
}

async function main() {
  const rawText = await loadSourceText();
  const text = unwrapJsonBody(rawText);

  const parsed = parseMarkdownTable(text) || parseHtmlTable(text);
  if (!parsed) {
    console.error(`Fetch preview: ${text.slice(0, 400).replace(/\s+/g, " ")}`);
    throw new Error("Could not locate ATP schedule table in fetched content.");
  }

  const { dateHeaders, rows: parsedRows } = parsed;
  const mondays = mondayDates(4);
  const mondayKeys = mondays.map(formatHeaderDate);
  const tournamentColumnHints = buildTournamentColumnHints(parsedRows, dateHeaders.length);

  const players = parsedRows.map((row) => {
    const rebuiltSchedule = rebuildScheduleColumns(
      row.rawScheduleCells,
      tournamentColumnHints,
      dateHeaders.length
    );

    const tournamentsByDate = {};
    for (let i = 0; i < dateHeaders.length; i += 1) {
      const dateHeader = dateHeaders[i];
      if (!dateHeader) continue;
      const parsedDate = parseDateHeader(dateHeader);
      if (!parsedDate) continue;
      tournamentsByDate[formatHeaderDate(parsedDate)] = rebuiltSchedule[i] || "";
    }

    const iso2 = IOC3_TO_ISO2[row.country3] || "";

    return {
      rank: row.rank,
      name: row.name,
      age: row.age,
      country3: row.country3,
      countryIso2: iso2,
      flag: isoToFlag(iso2),
      next4Weeks: mondayKeys.map((dateKey) => ({
        date: dateKey,
        tournament: tournamentsByDate[dateKey] || "-",
      })),
    };
  });

  const output = {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    columns: mondayKeys,
    players,
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/entries.json", JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`Saved ${players.length} players to data/entries.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
