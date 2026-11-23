// One-off: writes WebP and AVIF copies of the landing hero pictures next to the originals in public/landing/.
// Not part of the build and not a project dependency. Run it again only when a hero picture changes.
//
//   1. Install sharp somewhere outside the project, e.g.:  mkdir C:\tmp\imgtool; cd C:\tmp\imgtool; npm i sharp@0.34.5
//   2. From frontend/:  $env:SHARP_FROM = "C:\tmp\imgtool\"; node scripts/one-off/hero-images.mjs
//
// It only writes files and prints the sizes; LandingPage.tsx decides which formats it uses.
import {createRequire} from "node:module";
import {statSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const from = process.env.SHARP_FROM;
if (!from) throw new Error("Set SHARP_FROM to the folder where sharp is installed (see the comment at the top).");
const sharp = createRequire(pathToFileURL(join(from, "x.js")))("sharp");

const DIR = "public/landing";
const PICTURES = ["calendar-phone.png", "hero-calendar.jpg"];
const kb = (file) => `${(statSync(join(DIR, file)).size / 1024).toFixed(1)} KB`;

for (const name of PICTURES) {
    const base = name.replace(/\.\w+$/, "");
    const input = sharp(join(DIR, name));
    const {width, height} = await input.metadata();
    await input.clone().webp({quality: 82, effort: 6}).toFile(join(DIR, `${base}.webp`));
    await input.clone().avif({quality: 55, effort: 6}).toFile(join(DIR, `${base}.avif`));
    console.log(`${name} ${width}x${height}: original ${kb(name)}, webp ${kb(`${base}.webp`)}, avif ${kb(`${base}.avif`)}`);
}
