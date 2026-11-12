#!/usr/bin/env node
// 작성하신 샤라웃 글에서 「발행 전에 한 번 더 볼 것」을 체크리스트로 뽑는다. 통과 · 불통과 판정은 하지 않는다.
// 고친 문장은 만들지 않는다.
// 쓰는 법: node check.mjs <글.txt> --cards <기록 폴더>/cards.json [--plan <크루>.plan.json] [--partner <활동명>] [--compare <다른 채널 글.txt>] [--sns] [--json <저장할 파일>]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const VAL = ["--cards", "--partner", "--compare", "--json", "--plan", "--channel"];
const file = args.find((a, i) => !a.startsWith("--") && !VAL.includes(args[i - 1]));
if (!file || !opt("--cards")) { console.error("쓰는 법: node check.mjs <글.txt> --cards <기록 폴더>/cards.json [--partner <활동명>]"); process.exit(1); }

const text = fs.readFileSync(file, "utf8").normalize("NFC");
const cards = JSON.parse(fs.readFileSync(opt("--cards"), "utf8"));
const who = opt("--partner");
const targets = who ? cards.partners.filter((p) => p.name === who.normalize("NFC")) : cards.partners;
if (!targets.length) { console.error("cards.json 에서 소개할 크루를 찾지 못했어요."); process.exit(1); }

// must: 발행 전에 꼭 볼 것 · look: 한 번 더 읽어 볼 것 · ok: 잘 들어갔어요
const items = [];
let curCrew = "";
const add = (level, item, note = "", quote = "") => items.push({ level, item, note, quote, crew: curCrew });
const eul = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? "을" : "를"; };
const flat = (s) => s.replace(/\s+/g, " ").trim();
const nospace = (s) => s.replace(/\s+/g, "").toLowerCase();
const bareUrl = (u) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const empty = (v) => !v || /^\(.*\)$/.test(String(v).trim());
const noUrl = (s) => s.replace(/https?:\/\/\S+|www\.\S+/g, " ");
const T = nospace(text);
const sentences = text.split(/(?<=[.!?。])\s+|\n+/).map(flat).filter(Boolean);
const quoteOf = (w) => sentences.find((s) => nospace(s).includes(nospace(w))) || "";

async function opens(url) {
  const u = /^https?:\/\//.test(url) ? url : "https://" + url;
  try {
    const res = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (Macintosh) geo-shoutout-check" }, signal: AbortSignal.timeout(15000) });
    return { ok: res.status < 400, status: res.status, text: await res.text(), blocked: [403, 429, 999].includes(res.status) };
  } catch { return { ok: false, status: 0, text: "" }; }
}

// 피해 줄 표현을 낱말과 뜻으로 나눈다
// 「개인이벤트 기획 (생일파티, 웨딩)」 → 개인이벤트 기획 · 생일파티 · 웨딩 / 「위탁 판매x」 → 위탁 판매
// 「효과·결과 장담」 「~하는 말」 「~돌리진 않아요」처럼 뜻 · 문장으로 적은 건 Claude 가 읽고 본다
function splitAvoid(avoid) {
  if (empty(avoid)) return { literal: [], described: [], fixes: [] };
  const inner = [];
  const outer = String(avoid).replace(/\(([^)]*)\)/g, (_, x) => { inner.push(...x.split(/\s*[,/]\s*/)); return " "; });
  const raw = [...outer.split(/\s*[,/\n]\s*|(?<=[.。])\s+/), ...inner].map((w) => w.replace(/[.。ㅎㅋ~]+$/, "").replace(/\s*[xX✕×]\s*$/, "").replace(/^like\s+/i, "").replace(/[「」『』"]/g, "").trim()).filter((w) => w.length >= 2);
  const literal = [], described = [], fixes = [];
  const lits = (str) => str.split(/\s*·\s*/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.split(/\s+/).length <= 3);
  for (let w of raw) {
    w = w.replace(/\s*(?:은|는)?\s*금지$/, "").trim();
    // 「A 아니고 B」: A 는 쓰지 말 표기, B 는 맞는 표기
    const nb = w.match(/^(.+?)\s+아니고\s+(.+)$/);
    if (nb) { literal.push(nb[1].trim()); fixes.push({ wrong: nb[1].trim(), right: nb[2].trim() }); continue; }
    // 「가 · 나 · 다 같은 ~ 표현/단정」: 앞은 낱말, 뒤는 뜻
    const like = w.match(/^(.+?)\s*같은\s+(.+)$/);
    if (like) { literal.push(...lits(like[1])); described.push(w); continue; }
    if (/(말|표현|단정|장담|느낌|뉘앙스|과장)$/.test(w) || /(요|다|음|함)$/.test(w) || w.split(/\s+/).length >= 4) described.push(w);
    else literal.push(...lits(w));
  }
  return { literal: [...new Set(literal)], described, fixes };
}
const crewWords = targets.flatMap((p) => [p.name, ...String(p.card?.callName || "").split(/\s*\/\s*/)]).map((x) => x.replace(/\(.*?\)/g, "").trim()).filter((x) => x.length >= 2);
function avoidCheck(avoid, whose, mine = false) {
  const { literal, described, fixes } = splitAvoid(avoid);
  for (const w of literal) {
    if (!T.includes(nospace(w))) continue;
    const q = quoteOf(w);
    // 내 카드의 피할 말은 「내 일」을 말할 때만: 크루를 설명하는 문장이면 넘어간다
    if (mine && crewWords.some((c) => nospace(q).includes(nospace(c)))) continue;
    const fix = fixes.find((f) => f.wrong === w);
    if (fix) { add(mine ? "look" : "must", `${mine ? "" : "🚫 "}표기 「${w}」`, `「${fix.right}」로 써 주세요`, q); continue; }
    const neg = /(아니|않|없|말고|대신|안\s|안$|안한|안 해)/.test(q.slice(q.indexOf(w) + w.length, q.indexOf(w) + w.length + 14));
    add(mine ? "look" : "must", mine ? `내 카드에 적은 피할 말 「${w}」` : `🚫 ${whose} 쓰지 말아 달라고 한 말 「${w}」`, neg ? "「~아니에요」처럼 부정해도 들어가 있어요 · 아예 빼는 게 안전해요" : `이 말을 빼 주세요`, q);
  }
  if (described.length) add("look", mine ? "내 카드에 적은 피할 말" : `🚫 ${whose} 피해 달라고 한 느낌`, `「${described.join("」 「")}」 · 이런 느낌의 문장이 없는지 읽어 봐 주세요 (Claude 도 같이 읽고 짚어요)`);
}

for (const p of targets) {
  curCrew = p.name;
  const c = p.card || {};
  const L = targets.length > 1 ? `${p.name} · ` : "";
  const nm = empty(c.callName) ? [] : String(c.callName).split(/\s*\/\s*/).map((n) => n.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
  const pending = c._unconfirmed || [];

  if (!nm.length) add("must", `${p.name} 님 사이트 이름`, "카드에 사이트 이름이 없어요 · 크루에게 물어봐서 넣어요");
  else if (!T.includes(nospace(nm[0])) && !nm.some((n) => T.includes(nospace(n)))) add("must", `${p.name} 님 사이트 이름 「${nm[0]}」`, "글에 이 이름이 안 보여요 · 카드에 적힌 그대로 넣어 주세요");
  else add("ok", `${p.name} 님 사이트 이름 「${nm[0]}」`, pending.includes("callName") ? "아직 크루가 확인해 주기 전이에요 · 확인받고 올려요" : "");

  if (empty(c.oneLine)) add("must", `${p.name} 님이 하는 일`, "카드에 한 줄 소개가 비어 있어요 · 크루에게 물어봐서 하는 일을 한 문장 넣어요");
  else add("look", `${p.name} 님이 하는 일`, `무슨 일을 하는 곳인지 한 문장 들어갔나요? (카드 문구 「${c.oneLine}」와 똑같이 안 써도 돼요)`);

  if (empty(c.url)) add("must", `🔗 ${p.name} 님 사이트 주소`, "카드에 주소가 없어요 · 크루에게 받아서 꼭 넣어요 (이 과제에서 가장 중요해요)");
  else {
    const has = text.toLowerCase().includes(bareUrl(c.url));
    if (!has) add("must", `🔗 ${p.name} 님 사이트 주소`, `${String(c.url).replace(/[?#].*$/, "")} 가 글에 없어요 · 꼭 넣어 주세요. 이 링크가 크루에게 가는 백링크예요`);
    else add("ok", `🔗 ${p.name} 님 사이트 주소`, pending.includes("url") ? "아직 크루가 확인해 주기 전인 주소예요" : "");
    const r = await opens(c.url);
    if (!r.ok && !r.blocked) add("must", `${p.name} 님 주소가 열리는지`, "지금 열리지 않아요 · 크루에게 확인해 주세요 (내 글 문제는 아니에요)");
    if (r.text) {
      const meta = [...r.text.matchAll(/<meta[^>]+content="([^"]+)"/gi)].map((m) => m[1]).join(" ");
      const site = nospace(noUrl(r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ") + " " + meta));
      const copied = sentences.find((s) => { const n = nospace(noUrl(s)); for (let i = 0; i + 30 <= n.length; i += 5) if (site.includes(n.slice(i, i + 30))) return true; return false; });
      if (copied) add("look", `${p.name} 님 사이트 문장을 그대로 옮긴 곳`, "내 말로 바꾸면 더 내 소개처럼 읽혀요", copied);
    }
  }
  avoidCheck(c.avoid, `${p.name} 님이`);
}
curCrew = "";
if (cards.me?.card?.avoid) avoidCheck(cards.me.card.avoid, "", true);

// 기획 리포트의 「옮기지 않을 말」 · 「같이 밝혀 주면 좋은 말」
if (opt("--plan") && fs.existsSync(opt("--plan"))) {
  const plan = JSON.parse(fs.readFileSync(opt("--plan"), "utf8"));
  for (const c of plan.crews || []) {
    curCrew = c.name;
    for (const n of c.site?.noCopy || []) {
      const key = String(n).replace(/\(.*?\)/g, "").trim();
      if (key.length >= 2 && key.split(/\s+/).length <= 4 && T.includes(nospace(key))) add("must", `🚫 ${c.name} 님 사이트에서 옮기지 않기로 한 말 「${key}」`, "이 말은 빼 주세요", quoteOf(key));
    }
    for (const m of c.site?.mustSay || []) add("look", `${c.name} 님 소개에 같이 밝혀 주면 좋은 말`, `「${m}」 · 글에 들어갔나요?`);
  }
  curCrew = "";
}

const holes = [...text.matchAll(/\[확인 필요[^\]]*\]|\((?:사진|이미지|그림)\s*[:：][^)]*\)|\{[^}\n]{1,30}\}|○○|△△|□□/g)].map((m) => m[0]);
if (holes.length) add("must", "아직 안 채운 칸", "채우거나 지워 주세요", [...new Set(holes)].slice(0, 3).join(" · "));

const HYPE = ["최고", "1위", "넘버원", "No.1", "유일", "최초", "완벽", "보장", "무조건", "100%", "최대"];
for (const w of HYPE.filter((w) => text.includes(w) && !items.some((x) => x.item.includes(`「${w}」`)))) add("must", `부풀린 말 「${w}」`, "근거가 없으면 빼 주세요", quoteOf(w));
if (text.includes("전문가")) add("look", "「전문가」", "카드나 사이트에 자격 · 경력이 적혀 있을 때만 써요", quoteOf("전문가"));
if (/(여기|클릭)\s*[:：→➡>-]*\s*(https?:\/\/|www\.)/.test(text)) add("look", "링크 앞 글자", "「여기 · 클릭」 대신 사이트 이름 뒤에 주소를 붙이면 더 좋아요");

if (args.includes("--sns")) {
  const tags = ["#스폰지클럽", "#AI커뮤니티", "#AI해자"].filter((t) => !text.includes(t));
  if (tags.length) add("must", "공통 SNS · 해시태그", `${tags.join(" ")} 를 넣어요`);
  else add("ok", "공통 SNS · 해시태그");
  if (!text.includes("@spongeclub.ai")) add("look", "공통 SNS · 태그", "인스타 · 스레드는 @spongeclub.ai, 링크드인 · 페이스북은 안내 계정 태그");
  add("look", "공통 SNS · 이미지 · 인증", "4:5 이미지 · 슬랙 #공통-sns-기록하고-셸받기 에 /SNS 인증 · AI 없이 내 언어로 썼는지 · 규칙이 바뀌었을 수 있으니 과제 안내도 한 번 더 봐 주세요");
}

add("look", "내가 본 것 · 느낀 것", "사이트에서 본 것, 내 느낌이나 경험이 들어갔나요? 카드 내용만 있으면 광고처럼 보여요");
add("look", "내 말투", "내가 쓴 글처럼 읽히나요? AI 도움을 받았다면 내 말로 한 번 더 다듬어요");

const other = opt("--compare");
if (other) {
  const strip = (s) => {
    let t = s.normalize("NFC");
    for (const p of targets) for (const v of [p.card?.callName, p.card?.oneLine]) if (!empty(v)) for (const x of String(v).split(/\s*\/\s*/)) if (x) t = t.split(x).join(" ");
    return nospace(noUrl(t));
  };
  const grams = (s) => { const g = new Set(); for (let i = 0; i + 4 <= s.length; i++) g.add(s.slice(i, i + 4)); return g; };
  const A = grams(strip(text)), B = grams(strip(fs.readFileSync(other, "utf8")));
  const ratio = Math.round(([...A].filter((g) => B.has(g)).length / Math.max(1, Math.min(A.size, B.size))) * 100);
  const otherText = fs.readFileSync(other, "utf8").normalize("NFC");
  const oset = new Set(otherText.split(/(?<=[.!?。])\s+|\n+/).map((x) => nospace(noUrl(x))).filter((x) => x.length >= 15));
  const same = sentences.filter((x) => oset.has(nospace(noUrl(x))));
  for (const x of same.slice(0, 3)) add("must", "다른 채널 글과 똑같은 문장", "두 곳에 같은 문장이 있어요 · 한쪽을 다른 말로 바꿔 주세요", x);
  // 파일 이름 「<크루>-<채널>-<n>차.txt」에서 채널 이름을 읽는다
  const otherCh = (path.basename(other).match(/-([^-]+)-\d+차\.txt$/) || [])[1] || "다른 채널";
  const label = `${otherCh} 글과 비슷한 정도`;
  if (ratio >= 40) add(ratio >= 60 ? "must" : "look", label, `두 글이 ${ratio}% 비슷해요 · 같은 글을 두 곳에 올린 것처럼 보일 수 있어요. 순서 · 말투 · 내용을 바꿔 주세요`);
  else add("ok", label, `두 글이 ${ratio}% 비슷해요 · 40% 안이라 괜찮아요 (크루 이름 · 한 줄 · 주소는 빼고 셌어요)`);
}

const G = { must: "발행 전에 꼭 볼 것", look: "한 번 더 읽어 볼 것", ok: "잘 들어갔어요" };
let out = "";
for (const lv of ["must", "look", "ok"]) {
  const list = items.filter((x) => x.level === lv);
  if (!list.length) continue;
  out += `\n### ${G[lv]} (${list.length})\n`;
  for (const x of list) out += `- [${lv === "ok" ? "x" : " "}] ${x.item}${x.note ? `: ${x.note}` : ""}${x.quote ? `\n  > ${x.quote}` : ""}\n`;
}
out += "\n이런 게 걸려요. 최종 발행 전에 직접 검수해 주세요. 발행은 직접 해요.";
console.log(out.trim());
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ file, channel: opt("--channel") || "", at: new Date().toISOString(), items }, null, 2));
