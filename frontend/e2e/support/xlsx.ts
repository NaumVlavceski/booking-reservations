import {inflateRawSync} from "node:zlib";

// Just enough of a .xlsx reader to check an export: unzip (central directory + raw deflate), then read the first
// worksheet's cells, resolving shared strings and inline strings. No dependency needed.

function unzip(buf: Buffer): Map<string, Buffer> {
    const files = new Map<string, Buffer>();
    // End of central directory: signature 0x06054b50, searched from the end
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry");
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        const lNameLen = buf.readUInt16LE(localOffset + 26);
        const lExtraLen = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const data = buf.subarray(start, start + compSize);
        files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
        p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

const decode = (s: string) => s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export interface Workbook {
    files: string[];
    sheetNames: string[];
    /** Rows of the first worksheet, cells as strings ("" for empty). */
    rows: string[][];
}

export function readXlsx(buf: Buffer): Workbook {
    const files = unzip(buf);
    if (!files.has("[Content_Types].xml")) throw new Error("zip has no [Content_Types].xml: not an Office file");
    const shared: string[] = [];
    const sst = files.get("xl/sharedStrings.xml")?.toString("utf8");
    if (sst) {
        for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
            shared.push(decode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
        }
    }
    const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
    const sheetNames = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decode(m[1]));
    const sheetFile = [...files.keys()].filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
    const xml = files.get(sheetFile)?.toString("utf8") ?? "";
    const rows: string[][] = [];
    for (const row of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
        const cells: string[] = [];
        for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
            const ref = c.match(/ r="([A-Z]+)\d+"/)?.[1] ?? "";
            const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
            const type = c.match(/ t="([^"]+)"/)?.[1];
            const value = type === "s" ? shared[Number(c.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? ""
                : type === "inlineStr" ? decode((c.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]) ?? "")
                : decode(c.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
            if (col >= 0) cells[col] = value;
        }
        rows.push(Array.from(cells, (v) => v ?? ""));
    }
    return {files: [...files.keys()], sheetNames, rows};
}
