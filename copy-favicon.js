import fs from "fs";
import path from "path";

const src = path.resolve("sentrix-dashboard/src/assets/sentrix-dark.ico");
const destDir = path.resolve("sentrix-dashboard/public");
const dest = path.join(destDir, "favicon.ico");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Favicon copied successfully to public/favicon.ico");
