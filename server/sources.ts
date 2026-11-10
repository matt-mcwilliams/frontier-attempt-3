import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { AppError, config } from "./config.ts";
import type { Paper } from "../shared/types.ts";

const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) return !blocked.check(address, "ipv4");
  // Only global-unicast IPv6. IPv4-mapped, link-local, ULA and loopback are excluded.
  return isIP(address) === 6 && /^[23][\da-f]{3}:/i.test(address);
}
export async function fetchPublic(
  url: string,
  redirects = 0,
): Promise<{ data: Buffer; type: string; url: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new AppError(400, "Enter a valid HTTPS source URL or DOI.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new AppError(
      400,
      "Source URLs must use public HTTPS without credentials or custom ports.",
    );
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new AppError(
      400,
      "Local and private network URLs cannot be imported. Upload the file instead.",
    );
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the validated DNS result to avoid a second lookup / DNS rebinding.
    const req = request(
      u,
      {
        family: address.family,
        lookup: (_host, _options, cb) =>
          cb(null, address.address, address.family),
        headers: {
          "User-Agent":
            "MarginResearchTutor/0.1 (personal scholarly source import)",
          Accept: "application/pdf,text/html,application/json",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 4) {
            reject(
              new AppError(
                400,
                "Too many source redirects. Upload the PDF instead.",
              ),
            );
            return;
          }
          void fetchPublic(
            new URL(res.headers.location, u).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new AppError(
              502,
              `Source returned HTTP ${res.statusCode}. Try a legal PDF upload.`,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > 20 * 1024 * 1024)
            req.destroy(
              new AppError(
                413,
                "The source is larger than the 20 MB import limit.",
              ),
            );
          else chunks.push(c);
        });
        res.on("end", () =>
          resolve({
            data: Buffer.concat(chunks),
            type: res.headers["content-type"] ?? "",
            url: u.href,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(20000, () =>
      req.destroy(
        new AppError(
          504,
          "Source download timed out. Try uploading a local PDF.",
        ),
      ),
    );
    req.on("error", reject);
    req.end();
  });
}
export function extractDoi(value: string): string | null {
  const cleaned = value.trim().replace(/^doi:\s*/i, "");
  const match = cleaned.match(
    /(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s?#]+)/i,
  );
  return match?.[1].replace(/[.,;]$/, "").toLowerCase() ?? null;
}
export function plainText(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
export async function importDoi(doi: string): Promise<Paper> {
  const response = await fetchPublic(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
  );
  const d = JSON.parse(response.data.toString()).message;
  if (!d?.DOI || d.DOI.toLowerCase() !== doi.toLowerCase() || !d.title?.[0])
    throw new AppError(502, "The DOI metadata could not be verified.");
  let oaUrl: string | null = null;
  let license: string | null = null;
  let oaProvenance = "";
  try {
    const url = new URL(
      `https://api.openalex.org/works/https://doi.org/${doi}`,
    );
    if (config.OPENALEX_API_KEY)
      url.searchParams.set("api_key", config.OPENALEX_API_KEY);
    const oa = JSON.parse((await fetchPublic(url.href)).data.toString());
    const loc = oa.best_oa_location;
    if (loc?.is_oa) {
      oaUrl = loc.pdf_url ?? loc.landing_page_url ?? null;
      license = loc.license ?? null;
    }
    oaProvenance = "; open-access discovery checked with OpenAlex";
  } catch {
    oaProvenance = "; OpenAlex unavailable (no open-access claim made)";
  }
  const abstract = plainText(d.abstract ?? "");
  return {
    id: randomUUID(),
    title: plainText(d.title[0]),
    authors: (d.author ?? [])
      .map((a: { given?: string; family?: string }) =>
        [a.given, a.family].filter(Boolean).join(" "),
      )
      .join("; "),
    year: d.published?.["date-parts"]?.[0]?.[0] ?? null,
    doi: d.DOI,
    url: `https://doi.org/${d.DOI}`,
    abstract,
    text: "",
    access: abstract ? "abstract-only" : "metadata-only",
    provenance: `Crossref DOI metadata${oaProvenance}; full paper not retrieved`,
    verifiedAt: new Date().toISOString(),
    oaUrl,
    license,
    pages: null,
  };
}
export async function extractPdf(data: Buffer) {
  if (data.subarray(0, 5).toString() !== "%PDF-")
    throw new AppError(400, "This file is not a PDF.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  try {
    if (pdf.numPages > 300)
      throw new AppError(
        413,
        "Import a paper or an excerpt of at most 300 pages.",
      );
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const p = await pdf.getPage(n);
      const c = await p.getTextContent();
      pages.push(
        `[PDF page ${n}]\n${c.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("")}`,
      );
    }
    const text = pages.join("\n\n");
    if (text.replace(/\[PDF page \d+\]/g, "").trim().length < 100)
      throw new AppError(
        422,
        "This PDF has little extractable text. Use a text-based PDF; you can attach page images for a deliberate visual reading. OCR is not silently assumed.",
      );
    return { text: text.slice(0, 1500000), pages: pdf.numPages };
  } finally {
    await loading.destroy();
  }
}
export function sourceContext(
  paper: Paper | undefined,
  query: string,
  maxChars = 24000,
): string {
  if (!paper)
    return "No paper is selected. Discuss general principles; do not attribute claims to a paper.";
  const header = JSON.stringify({
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    doi: paper.doi,
    year: paper.year,
    access: paper.access,
    url: paper.url,
    provenance: paper.provenance,
  });
  if (!paper.text)
    return `${header}\nPublisher abstract (not full-text evidence):\n${paper.abstract || "(No abstract available)"}`;
  const chunks = paper.text.split(/(?=\[PDF page \d+\])/).flatMap((p) => {
    const page = p.match(/^\[PDF page \d+\]/)?.[0] ?? "[Imported text]";
    const result: string[] = [];
    for (let i = 0; i < p.length; i += 2200)
      result.push(`${page}\n${p.slice(i, i + 2400)}`);
    return result;
  });
  const words = [...new Set(query.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
  const ranked = chunks
    .map((text, i) => ({
      text,
      i,
      score: words.reduce(
        (n, w) => n + (text.toLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const selected = new Set<number>([0]);
  let count = chunks[0]?.length ?? 0;
  for (const c of ranked)
    if (!selected.has(c.i) && count + c.text.length < maxChars) {
      selected.add(c.i);
      count += c.text.length;
    }
  return `${header}\nSource excerpts selected by lexical relevance. Omitted pages are NOT evidence. Page numbers are PDF pages, not journal page numbers. Extraction may damage equations.\n${[
    ...selected,
  ]
    .sort((a, b) => a - b)
    .map((i) => chunks[i])
    .join("\n\n")}`;
}
