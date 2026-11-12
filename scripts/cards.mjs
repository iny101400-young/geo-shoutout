#!/usr/bin/env node
// 유닛 레포를 최신으로 받고, N주차_<이름>.md 에서 내 카드와 소개할 크루 카드를 읽는다.
// 쓰는 법: node cards.mjs <활동명> [--repo <유닛 레포 경로>] [--out <기록 폴더>] [--no-pull]
//          [--set "<누구>.<칸>=<값>"]... [--unconfirmed] [--add-crew <크루 활동명>]
//   누구: me 또는 크루 활동명 · 칸: callName | oneLine | url | avoid
//   --set 으로 고친 값은 overrides.json 에 따로 쌓여 레포 값을 덮어쓰지 않는다. 다시 불러와도 남는다.
//   --unconfirmed: 아직 상대 확인 전인 값으로 표시한다. --add-crew: 큐레이션에 같은 조 크루를 더한다(그 크루 파일의 「내 카드」를 읽는다)
//   --remove-crew <크루>: 더한 크루를 뺀다 · --unset "<누구>.<칸>": 고친 값을 지우고 레포 값으로 돌아간다
// 결과: 표준 출력에 JSON · 기록 폴더(dir)의 cards.json 에도 저장. 지금 폴더가 유닛 레포 안이면 ~/geo-shoutout-기록 아래로
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const name = (args.find((a, i) => !a.startsWith("--") && !["--repo", "--out", "--set", "--add-crew", "--remove-crew", "--unset"].includes(args[i - 1])) || "").normalize("NFC").trim();
if (!name) { console.error("이름을 주세요: node cards.mjs <이름>"); process.exit(1); }

const nfc = (s) => s.normalize("NFC");
const WEEK = /^(\d+)주차$/;
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

// 주차 폴더 안에 N주차_*.md 가 있고 .git 이 있는 폴더 = 유닛 레포
function isRepo(d) {
  if (!fs.existsSync(path.join(d, ".git"))) return false;
  return ls(d).some((e) => e.isDirectory() && WEEK.test(nfc(e.name))
    && ls(path.join(d, e.name)).some((f) => /^\d+주차_.+\.md$/.test(nfc(f.name))));
}
// 유닛 레포 후보를 모두 모은다 (같은 레포를 여러 번 받아 둔 사람도 있다)
function findRepos() {
  const given = opt("--repo");
  if (given) return isRepo(path.resolve(given)) ? [path.resolve(given)] : [];
  const found = [];
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    if (isRepo(d)) found.push(d);
    if (path.dirname(d) === d) break;
  }
  const home = os.homedir();
  const roots = [home, path.join(home, "Desktop"), path.join(home, "Documents"), path.join(home, "바탕화면"), path.join(home, "문서")];
  const seen = new Set();
  const walk = (d, depth) => {
    if (depth < 0 || seen.has(d)) return;
    seen.add(d);
    if (isRepo(d)) { found.push(d); return; }
    for (const e of ls(d)) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name === "Library" || e.name === ".Trash" || e.name.startsWith(".") && e.name !== ".repo-4th-geo" && !e.name.startsWith(".repo")) continue;
      walk(path.join(d, e.name), depth - 1);
    }
  };
  for (const r of roots) walk(r, 4);
  return [...new Set(found)];
}
const gitPull = (repo) => {
  try { execFileSync("git", ["-C", repo, "pull", "--ff-only", "-q"], { stdio: "pipe" }); return "최신으로 받음"; }
  catch (e) { return "받기 실패 · 지금 파일로 계속: " + String(e.stderr || e.message).trim().split("\n")[0]; }
};
const weeksOf = (repo) => ls(repo).filter((e) => e.isDirectory() && WEEK.test(nfc(e.name)))
  .map((e) => ({ dir: e.name, n: Number(nfc(e.name).match(WEEK)[1]) })).sort((a, b) => b.n - a.n);
const fileIn = (repo, w, who) => {
  const f = ls(path.join(repo, w.dir)).find((e) => nfc(e.name) === `${w.n}주차_${who}.md`);
  return f ? path.join(repo, w.dir, f.name) : null;
};
const mineIn = (repo) => {
  for (const w of weeksOf(repo)) {
    const f = fileIn(repo, w, name);
    if (f && fs.readFileSync(f, "utf8").includes("샤라웃")) return { week: w, mine: f };
  }
  return null;
};

const repos = findRepos();
if (!repos.length) {
  console.log(JSON.stringify({ ok: false, reason: "유닛 레포 폴더를 찾지 못했어요. --repo <경로> 로 알려 주거나, 유닛 레포를 먼저 받아 주세요." }, null, 2));
  process.exit(0);
}
// 먼저 받고(pull) 내 파일이 있는 레포를 고른다
const doPull = !args.includes("--no-pull");
let repo = null, pull = "건너뜀", hit = null;
for (const r of repos) {
  const p = doPull ? gitPull(r) : "건너뜀";
  const h = mineIn(r);
  if (h) { repo = r; pull = p; hit = h; break; }
}
if (!hit) {
  console.log(JSON.stringify({ ok: false, repos, reason: `「${name}」 이름의 샤라웃 칸이 있는 주차 파일을 찾지 못했어요. 이름 표기를 확인해 주세요.` }, null, 2));
  process.exit(0);
}
const { week, mine } = hit;
const fileOf = (w, who) => fileIn(repo, w, who);
const KEY = { "불러 줬으면 하는 이름": "callName", "내 한 줄": "oneLine", "한 줄": "oneLine", "대표 주소": "url", "피해 줄 표현": "avoid", "나를 소개해 줄 크루": "introducedBy" };
const empty = (v) => !v || /^\(.*\)$/.test(v.trim());
function sections(md) {
  const out = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^###\s+(.+)$/);
    if (h) { cur = { head: h[1].trim(), fields: {} }; out.push(cur); continue; }
    if (/^##\s/.test(line)) { cur = null; continue; }
    const m = cur && line.match(/^-\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    if (m && KEY[m[1].trim()]) cur.fields[KEY[m[1].trim()]] = m[2].trim();
  }
  return out;
}
const myMd = fs.readFileSync(mine, "utf8");
const secs = sections(myMd);
const myCard = secs.find((s) => s.head === "내 카드")?.fields || {};
const partners = secs.filter((s) => s.head.startsWith("내가 소개할 크루")).map((s) => {
  const who = s.head.replace(/\s*\(.*\)\s*$/, "").split(" · ").pop().trim();
  const note = (s.head.match(/\((.*)\)\s*$/) || [])[1] || "";
  return { name: who, note, card: { ...s.fields } };
});
// 크루 본인 파일의 「내 카드」와 내 파일에 옮겨 둔 카드를 견준다. 본인 파일 값을 쓰고, 다른 칸은 알려 준다
const repoDiffs = [];
const ownCard = (who) => { const f = fileOf(week, who); return f ? sections(fs.readFileSync(f, "utf8")).find((x) => x.head === "내 카드")?.fields || {} : null; };
for (const p of partners) {
  const tc = ownCard(p.name);
  if (!tc) continue;
  for (const k of ["callName", "oneLine", "url", "avoid"]) {
    if (!empty(tc[k]) && tc[k] !== p.card[k]) { repoDiffs.push({ who: p.name, field: k, inMyFile: p.card[k] || "", inTheirFile: tc[k] }); p.card[k] = tc[k]; }
  }
  if (!empty(tc.introducedBy)) p.introducedBy = tc.introducedBy.split(/\s*[·,/]\s*/).filter(Boolean);
}

// 같은 조인지: 주차 README 의 조 편성 줄(「- **N조 …** — 가 · 나 · 다」)에서 찾는다
function groupOf(who) {
  for (const w of weeksOf(repo)) {
    const rd = ls(path.join(repo, w.dir)).find((e) => /^readme\.md$/i.test(e.name));
    if (!rd) continue;
    for (const line of fs.readFileSync(path.join(repo, w.dir, rd.name), "utf8").split("\n")) {
      const m = line.match(/^-\s*\*\*(\d+)조[^*]*\*\*\s*[—-]\s*(.+)$/);
      if (m && m[2].split(/\s*·\s*/).map((x) => x.replace(/\(.*?\)/g, "").trim()).includes(who)) return m[1];
    }
  }
  return null;
}

// 기록 폴더: 지금 폴더의 geo/shoutout. 지금 폴더가 유닛 레포 안이면 레포가 더러워지지 않게 홈 폴더 아래로 둔다
const inRepo = (d) => { const r = path.relative(repo, d); return !r.startsWith("..") && !path.isAbsolute(r); };
const base = (opt("--out") && path.resolve(opt("--out"))) || (inRepo(process.cwd()) ? path.join(os.homedir(), "geo-shoutout-기록") : process.cwd());
const outDir = path.join(base, "geo", "shoutout");
fs.mkdirSync(outDir, { recursive: true });

// 사용자가 고친 값(overrides.json)은 따로 쌓아 두고, 불러올 때마다 레포 값과 견준다
const ovPath = path.join(outDir, "overrides.json");
let ov = { me: {}, crews: {}, extraCrews: [] };
try { ov = { ...ov, ...JSON.parse(fs.readFileSync(ovPath, "utf8")) }; } catch {}
const unconfirmed = args.includes("--unconfirmed");
args.forEach((a, i) => {
  if (a !== "--set") return;
  const m = String(args[i + 1] || "").match(/^([^.]+)\.(callName|oneLine|url|avoid)=(.*)$/s);
  if (!m) return;
  const [, who, field, value] = m;
  const slot = who === "me" ? ov.me : (ov.crews[who] ||= {});
  slot[field] = { value: value.trim(), confirmed: !unconfirmed, at: new Date().toISOString().slice(0, 10), repoWhenSet: null };
});
args.forEach((a, i) => {
  if (a !== "--unset" || !args[i + 1]) return;
  const [who, field] = args[i + 1].split(".");
  const slot = who === "me" ? ov.me : ov.crews[who];
  if (slot) delete slot[field];
});
const addErrors = [];
args.forEach((a, i) => {
  const who = (args[i + 1] || "").normalize("NFC");
  if (a === "--remove-crew") ov.extraCrews = ov.extraCrews.filter((x) => x !== who);
  if (a !== "--add-crew" || !who) return;
  // 나 자신 · 이미 짝인 크루 · 파일이 없는 이름 · 다른 조는 더하지 않는다
  if (who === name) return addErrors.push(`「${who}」은 나 자신이라 더할 수 없어요`);
  if (partners.some((p) => p.name === who)) return addErrors.push(`「${who}」님은 이미 소개할 크루예요`);
  if (!fileOf(week, who)) return addErrors.push(`「${who}」 이름의 ${week.n}주차 파일이 없어요 · 활동명을 확인해 주세요`);
  const g1 = groupOf(name), g2 = groupOf(who);
  if (g1 && g2 && g1 !== g2 && !args.includes("--any-group")) return addErrors.push(`「${who}」님은 ${g2}조예요(나는 ${g1}조) · 같은 조 크루만 더해요`);
  if (!ov.extraCrews.includes(who)) ov.extraCrews.push(who);
});

// 큐레이션으로 더한 크루
for (const who of ov.extraCrews) {
  if (partners.some((p) => p.name === who)) continue;
  const tc = ownCard(who);
  if (!tc) continue;
  partners.push({ name: who, note: "큐레이션에 더한 크루", card: { callName: tc.callName, oneLine: tc.oneLine, url: tc.url, avoid: tc.avoid }, added: true });
}

const overrideNotes = [];
const apply = (card, slot, who) => {
  for (const [k, o] of Object.entries(slot || {})) {
    const repoVal = card[k] || "";
    if (repoVal === o.value) { o.sameAsRepo = true; continue; } // 레포가 따라왔으면 표시만
    if (o.repoWhenSet == null) o.repoWhenSet = repoVal; // 고칠 때의 레포 값을 기억한다
    // 고친 뒤에 레포 값이 바뀌었을 때만 「어느 쪽으로 할까요?」를 묻는다
    overrideNotes.push({ who, field: k, repo: repoVal, mine: o.value, confirmed: o.confirmed, repoChanged: repoVal !== o.repoWhenSet });
    card[k] = o.value;
    (card._unconfirmed ||= []).push(...(o.confirmed ? [] : [k]));
  }
};
apply(myCard, ov.me, "me");
for (const p of partners) apply(p.card, ov.crews[p.name], p.name);
fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2));

// 피해 줄 표현이 「○○님이 쓰신 것과 동일」처럼 다른 크루를 가리키면 그 크루 카드의 피해 줄 표현을 가져온다
const resolveAvoid = (card) => {
  const m = String(card.avoid || "").match(/([가-힣A-Za-z0-9]+?)\s*님?(?:이|께서)?\s*(?:쓰신|적으신|적은|쓴)\s*(?:것|거)과?\s*(?:동일|같|똑같)/);
  if (!m) return;
  const src = ownCard(m[1]);
  if (src && !empty(src.avoid)) {
    // 크루가 직접 적은 부분은 남기고, 가리킨 크루의 표현을 덧붙인다 (그 크루에게만 맞는 말이 섞일 수 있어 확인이 필요하다)
    const own = String(card.avoid).replace(/[^.。]*?(?:쓰신|적으신|적은|쓴)\s*(?:것|거)과?\s*(?:동일|같|똑같)[^.。]*[.。]?/, "").replace(/(그리고|및)\s*$/, "").replace(/[.。ㅎㅋ~\s]+$/, "").trim();
    card.avoidFrom = { who: m[1], original: card.avoid, needCheck: true };
    card.avoid = [own, src.avoid].filter(Boolean).join(" / ");
  }
  else card.avoidNote = `「${card.avoid}」 · 가리키는 크루의 카드를 찾지 못했어요. 크루에게 확인해 주세요`;
};
resolveAvoid(myCard);
for (const p of partners) resolveAvoid(p.card);
// 「안 해 주셔도 돼요」처럼 소개를 원하지 않는다는 뜻으로 보이는 값
const notWanted = (c) => /(안\s*해\s*주셔도|원하지\s*않|빼\s*주세요|소개\s*(?:안|않))/.test([c.oneLine, c.avoid].join(" "));
for (const p of partners) { p.missing = ["callName", "oneLine", "url"].filter((k) => empty(p.card[k])); if (notWanted(p.card)) p.maybeNotWanted = true; }
const myMissing = ["callName", "oneLine", "url"].filter((k) => empty(myCard[k]));
const result = { ok: true, repo, pull, week: week.n, file: path.relative(repo, mine), group: groupOf(name), me: { name, card: myCard, missing: myMissing }, partners, repoDiffs, overrideNotes, addErrors, dir: outDir };
fs.writeFileSync(path.join(outDir, "cards.json"), JSON.stringify(result, null, 2));
result.saved = path.join(outDir, "cards.json");
console.log(JSON.stringify(result, null, 2));
