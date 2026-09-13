const fs = require("fs");
const path = require("path");
const root = __dirname;
const files = {
  "index.html": fs.readFileSync(path.join(root, "index.html"), "utf8"),
  "app.js": fs.readFileSync(path.join(root, "app.js"), "utf8"),
  "plays.js": fs.readFileSync(path.join(root, "plays.js"), "utf8"),
  "Open Play Designer.bat": fs.readFileSync(path.join(root, "Open Play Designer.bat"), "utf8"),
};
fs.writeFileSync(
  path.join(root, "pack-assets.js"),
  "window.RAIDERS_PACK_ASSETS = " + JSON.stringify(files) + ";\n"
);
console.log("pack-assets.js", Object.keys(files).join(", "));
