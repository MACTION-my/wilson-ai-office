// Copies functions/org.json (the single source of roles, steps and automations) into the web page as public/org.js.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const org = JSON.parse(fs.readFileSync(path.join(root, "functions", "org.json"), "utf8"));
fs.writeFileSync(path.join(root, "public", "org.js"), "window.ORG = " + JSON.stringify(org) + ";\n");
console.log("public/org.js written");
