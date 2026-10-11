// Local stand-in for Supabase: serves site/ and maps /rest/v1/rpc/<fn> to the
// real SQL functions on a local Postgres (run as the anon role), via psql.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const SITE = path.join(__dirname, "..", "site");
const PORT = Number(process.env.PORT || 8787);
const NULL = "__NULL__";
const FNS = {
  dr_list_users: [],
  dr_register: ["p_name", "p_pin"],
  dr_login: ["p_name", "p_pin"],
  dr_get_ratings: ["p_token"],
  dr_rate: ["p_token", "p_drink", "p_score", "p_bar", "p_comment"],
  dr_set_photo: ["p_token", "p_drink", "p_thumb", "p_data"],
  dr_drink_photos: ["p_token", "p_drink"],
  dr_photo: ["p_token", "p_drink", "p_name"],
  dr_recent_photos: ["p_token"],
  dr_award: ["p_token", "p_sticker"],
  dr_get_stickers: ["p_token"],
};
const TYPES = { mime: { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" } };

// Values go through temp files (\set name `cat file`) so big photos fit.
let seq = 0;
function callSql(fn, args, cb) {
  const params = FNS[fn];
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "mock-"));
  const sets = [];
  const call = params.map((p, i) => {
    const v = args[p];
    const file = path.join(dir, `a${i}`);
    fs.writeFileSync(file, v === null || v === undefined ? NULL : String(v));
    sets.push(`\\set a${i} \`cat ${file}\``);
    const cast = { p_token: "::uuid", p_score: "::int" }[p] || "";
    return `${p} => nullif(:'a${i}', '${NULL}')${cast}`;
  });
  const sql = `${sets.join("\n")}\nset role anon;\nselect ${fn}(${call.join(", ")});\n`;
  seq++;
  execFile("psql", ["-At", "-q", "-v", "ON_ERROR_STOP=1"], { env: process.env, maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
    fs.rmSync(dir, { recursive: true, force: true });
    cb(err, out);
  }).stdin.end(sql);
}

http.createServer((req, res) => {
  const m = req.url.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (m) {
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (!req.headers.apikey) { res.writeHead(401); return res.end("no apikey"); }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!FNS[m[1]]) { res.writeHead(404); return res.end(); }
      callSql(m[1], JSON.parse(body || "{}"), (err, out) => {
        if (err) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ message: String(err) })); }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(out.trim().split("\n").pop());
      });
    });
    return;
  }
  const file = path.join(SITE, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!file.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES.mime[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log("mock on " + PORT));
