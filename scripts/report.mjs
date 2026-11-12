#!/usr/bin/env node
// 샤라웃 콘텐츠 기획 리포트(HTML) 한 장을 만든다.
// 순서: ① 나 ② 소개할 크루(크루마다 카드 하나) ③ 어떻게 쓸까요(탭: 프롬프트로 받기 · 가이드로 받기 · 발행 전 체크리스트 / 채널마다, 그 안에서 크루마다)
// 쓰는 법: node report.mjs <기록 폴더>/<크루>.plan.json [--check <check.json>]... [--open]
// plan.json 모양은 SKILL.md 「plan.json」 참고. mode 가 "prompt" 면 프롬프트 탭, "guide" 면 가이드 탭을 먼저 연다.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const args = process.argv.slice(2);
const planPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--check");
if (!planPath) { console.error("쓰는 법: node report.mjs <plan.json> [--check <check.json>] [--open]"); process.exit(1); }
const dir = path.dirname(planPath);
const P = JSON.parse(fs.readFileSync(planPath, "utf8"));
const rel = (f) => (path.isAbsolute(f) || fs.existsSync(f) ? f : path.join(dir, path.basename(f)));

// 체크리스트: --check 를 여러 번 주거나 plan.checkFiles(채널마다 하나)
const checkPaths = [...args.map((a, i) => (a === "--check" ? args[i + 1] : null)).filter(Boolean), ...(P.checkFiles || []), ...(P.checkFile ? [P.checkFile] : [])].map(rel);
const C = [...new Set(checkPaths)].filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

// 내 카드: plan.me 에 없으면 같은 폴더의 cards.json 에서
let cardsJson = null;
try { cardsJson = JSON.parse(fs.readFileSync(path.join(dir, "cards.json"), "utf8")); } catch {}
const me = { name: P.me?.name || cardsJson?.me?.name || "", ...(cardsJson?.me?.card || {}), ...(P.me || {}) };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const empty = (v) => !v || /^\(.*\)$/.test(String(v).trim());
const fullUrl = (u) => (/^https?:/.test(u) ? u : "https://" + u);
const urlLink = (u) => `<a href="${esc(fullUrl(u))}" target="_blank">${esc(u)}</a>`;
const copyBtn = (u) => `<span class="ubtns"><a class="ugo" href="${esc(fullUrl(u))}" target="_blank">👀 구경하러 가기</a><button class="ucopy" data-url="${esc(fullUrl(u))}">📋 주소 복사</button></span>`;
// 볼 만한 곳: 「페이지 이름 · 주소」에서 주소를 떼어 이름을 하이퍼링크로 만들고, 주소 복사 버튼을 따로 붙인다
const lookItem = (l) => {
  let name = l.name || "", url = l.url || "";
  const m = name.match(/^(.*?)\s*[·:]\s*((?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/\S*)?)\s*$/i);
  if (!url && m) { name = m[1] || m[2]; url = m[2]; }
  return url ? `<b>${esc(name)}</b> ${copyBtn(url)}${l.desc ? `<div class="ldesc">${esc(l.desc)}</div>` : ""}` : `${esc(name)}${l.desc ? `: ${esc(l.desc)}` : ""}`;
};
const crews = (P.crews || []).map((c) => ({
  ...c,
  // 「A 아니고 B」 꼴 피해 줄 표현에서 맞는 표기를 뽑는다
  fixes: c.fixes || [...String(c.avoid || "").matchAll(/([^,/·\n]+?)\s+아니고\s+([^,/·\n]+)/g)].map((m) => ({ wrong: m[1].trim(), right: m[2].trim() })),
}));
const crewsOf = (ch) => crews.filter((c) => !ch.crews || ch.crews.includes(c.name));
const row = (k, v, cls = "") => (v ? `<div class="row ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>` : "");
const ul = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

// ── ① 나 ──
const meBox = `<section><h2><span class="n">1</span>나</h2>
<div class="card me">
  <div class="title">${esc(me.name)} <span class="sub">${me.callName && !empty(me.callName) ? `사이트명 · ${esc(me.callName)}` : ""}</span></div>
  ${row("하는 일", esc(empty(me.oneLine) ? "" : me.oneLine))}
  ${row("내 주소", empty(me.url) ? "" : `${urlLink(me.url)} ${copyBtn(me.url)}`)}
  ${row("내가 피할 말", empty(me.avoid) ? "" : esc(me.avoid), "soft-bad")}
</div>
<div class="card">
  <div class="title small">내가 담을 것</div>
  ${row("기억에 남은 것", esc(P.memory))}
  ${row(esc(P.angle?.type || "내 생각"), esc(P.angle?.line))}
  ${row("크루와 이어지는 점", esc(P.link))}
  ${row("이어 붙일 내 글", esc(P.myPost))}
</div></section>`;

// ── ② 소개할 크루 (크루마다 카드 하나) ──
const crewCard = (c, i) => `<div class="card crew">
  <div class="title">${crews.length > 1 ? `<span class="idx">${i + 1}</span>` : ""}${esc(c.name)} <span class="sub">사이트명 · ${esc(c.callName || "확인 필요")}</span>${(c.unconfirmed || []).length ? `<span class="pill p-warn">크루 확인 전 값 있음</span>` : ""}</div>
  <div class="url-box">🔗 <b>꼭 넣을 주소</b> ${c.url ? `${urlLink(c.url)} ${copyBtn(c.url)}` : "<b>아직 없어요 · 크루에게 받아 주세요</b>"}<small>이 주소가 글에 들어가야 크루에게 백링크가 생겨요</small></div>
  ${!empty(c.avoid) || c.fixes.length ? `<div class="no-box">🚫 <b>쓰지 말아 달라고 한 말</b>${!empty(c.avoid) ? `<div>${esc(c.avoid)}</div>` : ""}${c.fixes.length ? `<div class="fix">✏️ 맞는 표기 · ${c.fixes.map((f) => `「${esc(f.wrong)}」 ✕ → 「${esc(f.right)}」`).join(" · ")}</div>` : ""}</div>` : ""}
  ${row("하는 일", esc(c.doing || c.oneLine || "확인 필요"))}
  ${c.doing && c.oneLine && c.doing !== c.oneLine ? row("카드 문구", esc(c.oneLine)) : ""}
  ${c.site ? `${row("어떤 곳", esc(c.site.what))}${row("누구에게", esc(c.site.who))}${row("볼 만한 곳", c.site.look?.length ? `<ol class="look">${c.site.look.map((l) => `<li>${lookItem(l)}</li>`).join("")}</ol>` : "")}${row("옮기지 않을 말", c.site.noCopy?.length ? esc(c.site.noCopy.join(" · ")) : "", "soft-bad")}${row("같이 밝혀 주면 좋은 말", c.site.mustSay?.length ? esc(c.site.mustSay.join(" · ")) : "", "soft-acc")}` : ""}
</div>`;
const crewBox = `<section><h2><span class="n">2</span>소개할 크루${crews.length > 1 ? ` · ${crews.length}명` : ""}</h2>${crews.map(crewCard).join("")}</section>`;

// ── 다른 AI 에 붙일 코치 프롬프트: 초안을 대신 쓰지 않고 내가 쓰도록 이끈다 ──
function coachPrompt(ch, only) {
  const all = crewsOf(ch);
  const others = all.filter((c) => c !== only);
  const block = [only].map((c) => [
    `- 크루: ${c.name} (사이트명: ${c.callName || "[크루에게 확인]"})${(c.unconfirmed || []).length ? " · 아직 크루 확인 전인 값이 있어요" : ""}`,
    `- 하는 일: ${c.doing || c.oneLine || "[크루에게 확인]"}`,
    `- 꼭 넣을 주소(백링크 · 반드시 글에 넣기): ${c.url || "[크루에게 받기]"}`,
    c.site?.what ? `- 어떤 곳: ${c.site.what}${c.site.who ? ` · 대상: ${c.site.who}` : ""}` : "",
    c.site?.look?.length ? `- 볼 만한 곳: ${c.site.look.map((l) => `${l.name}(${l.desc})`).join(" / ")}` : "",
    `- 절대 쓰지 말 표현: ${empty(c.avoid) ? "없음" : c.avoid}`,
    c.fixes.length ? `- 맞는 표기: ${c.fixes.map((f) => `「${f.wrong}」가 아니라 「${f.right}」`).join(" · ")}` : "",
    c.site?.noCopy?.length ? `- 사이트에 있어도 옮기지 말 것: ${c.site.noCopy.join(" · ")}` : "",
    c.site?.mustSay?.length ? `- 같이 밝혀 주면 좋은 것: ${c.site.mustSay.join(" · ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
  return `너는 내가 ${ch.channel}에 올릴 「크루 소개 글」을 내가 직접 쓰도록 돕는 글쓰기 코치야.
글 전체나 문단을 대신 써 주지 마. 나는 내 말로 쓰고 싶어.
${others.length ? `\n이 글은 크루 ${all.length}명을 함께 소개하는 글이야(${all.map((c) => c.name).join(" · ")}). 이번에는 ${only.name} 님 부분만 같이 써 줘. ${others.map((c) => c.name).join(" · ")} 님 부분은 따로 할 거야.\n` : ""}

[소개할 크루]
${block}

[나]
- ${me.name}${!empty(me.oneLine) ? ` · 하는 일: ${me.oneLine}` : ""}
- 내가 피할 말(내 일을 말할 때): ${empty(me.avoid) ? "없음" : me.avoid}

[내가 담고 싶은 것]
- 사이트에서 기억에 남은 것: ${P.memory || ""}
- ${P.angle?.type || "내 생각"}: ${P.angle?.line || ""}
- 크루와 이어지는 점: ${P.link || ""}

[기획]
- 소개 방식: ${ch.method}
- 시작 추천: ${ch.start || ""}
- 읽을 사람: ${ch.reader || ""}
- 구성 순서: ${(ch.structure || []).join(" → ")}
- 말투 · 길이: ${ch.tone || ""}
${ch.diff ? `- 다른 채널 글과 다르게: ${ch.diff}\n` : ""}- 크루 사이트 주소는 꼭 들어가야 해. 내가 빠뜨리면 반드시 알려 줘.

[이렇게 도와줘]
1. 구성 순서대로 한 칸씩 진행해. 칸마다 내가 답하기 쉬운 질문을 1~2개 하고, 어떻게 쓰면 좋을지 추천만 짧게 해 줘 (완성 문장이나 빈칸 문장 틀은 주지 마).
2. 내가 문장을 쓰면 꼭 넣을 것이 빠졌는지, 쓰지 말 표현이 들어갔는지만 짚어 줘. 내 말투는 고치지 마.
3. 위에 없는 사실 · 숫자 · 후기 · 자격은 만들지 말고, 내가 쓰려고 하면 알려 줘.
4. 다 쓰면 내가 쓴 문장만 순서대로 이어 코드 블록 하나로 보여 줘. 새 문장은 넣지 말고 맞춤법 · 띄어쓰기만 고쳐.

첫 칸부터 시작해 줘.`;
}

// ── ③ 채널별 ──
const chHead = (ch) => `<div class="chhead"><b>${esc(ch.channel)}</b><span class="pill p-acc">${esc(ch.method)}</span>${ch.sns ? `<span class="pill p-warn">공통 SNS</span>` : ""}</div>`;
const perCrew = (ch) => crewsOf(ch).map((c) => `<div class="sub-crew">
  <div class="sc-title">${esc(c.name)} <span class="sub">사이트명 · ${esc(c.callName || "확인 필요")}</span></div>
  <div class="url-box tight">🔗 <b>꼭 넣을 주소</b> ${c.url ? `${urlLink(c.url)} ${copyBtn(c.url)}` : "<b>아직 없어요 · 크루에게 받기</b>"}</div>
  ${row("꼭 넣을 것", ul([`사이트명 「${c.callName || c.name}」 (카드 표기 그대로)`, `하는 일: ${c.doing || c.oneLine || "크루에게 확인"}`, ...(c.site?.mustSay || []).map((m) => `같이 밝히기: ${m}`)]))}
  ${!empty(c.avoid) || c.fixes.length || c.site?.noCopy?.length ? `<div class="no-box tight">🚫 <b>쓰지 말 것</b>${ul([...(!empty(c.avoid) ? [c.avoid] : []), ...c.fixes.map((f) => `「${f.wrong}」 ✕ → 「${f.right}」로`), ...(c.site?.noCopy || []).map((n) => `사이트에서 옮기지 말 것: ${n}`)])}</div>` : ""}
</div>`).join("");

const guideTab = (P.channels || []).map((ch) => `<div class="card ch">${chHead(ch)}
  <div class="grp">이 채널 글 전체</div>
  ${row("읽을 사람", esc(ch.reader))}
  ${row("시작 추천", esc(ch.start || ch.firstLine))}
  ${row("구성 순서", (ch.structure || []).length ? `<ol>${ch.structure.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "")}
  ${row("말투 · 길이", esc(ch.tone))}
  ${row("공통으로 넣을 것", ul(["기억에 남은 것 · 내 생각 (내 말로)"]))}
  ${row("공통으로 피할 것", ul(["부풀린 말(최고 · 1위 · 보장 등)", "카드 · 사이트에 없는 자격 · 숫자 · 후기", "사이트 문장을 길게 그대로 옮기기", ...(empty(me.avoid) ? [] : [`내가 피할 말: ${me.avoid}`])]))}
  ${row("링크 글자", esc(ch.linkText || "사이트 이름 뒤에 주소"))}
  ${row("다른 채널과 다르게", esc(ch.diff))}
  <div class="grp">크루별로${crewsOf(ch).length > 1 ? ` · ${crewsOf(ch).length}명` : ""}</div>
  ${perCrew(ch)}
  ${ch.sns ? `<div class="sns"><b>공통 SNS 과제 체크리스트</b><ul><li>☐ 글은 AI 없이 내 언어로</li><li>☐ 이미지 4:5 (1080×1350)</li><li>☐ #스폰지클럽 #AI커뮤니티 #AI해자</li><li>☐ 태그: 인스타 · 스레드는 @spongeclub.ai / 링크드인 · 페이스북은 젬마</li><li>☐ 슬랙 #공통-sns-기록하고-셸받기 에 /SNS 인증</li></ul><small>규칙이 바뀌었을 수 있으니 스폰지클럽 과제 안내를 한 번 더 봐 주세요</small></div>` : ""}
</div>`).join("");

const promptTab = (P.channels || []).map((ch, i) => `<div class="card ch">${chHead(ch)}${ch.sns
  ? `<p class="muted">이 채널은 공통 SNS 과제 규칙(AI 없이 내 언어로)이라 프롬프트 대신 「가이드로 받기」 탭을 보고 직접 써요.</p>`
  : `<p class="what">자주 쓰는 글쓰기 AI(Claude · ChatGPT 등)에 붙여 넣어요. AI 가 질문하고, <b>내가 한 문단씩 써요.</b>${crewsOf(ch).length > 1 ? ` 크루가 ${crewsOf(ch).length}명이라 크루마다 프롬프트를 나눴어요. 하나씩 차례로 쓰고, 마지막에 내가 이어 붙여요.` : ""}</p>${crewsOf(ch).map((c, j) => `${crewsOf(ch).length > 1 ? `<div class="pc-title"><span class="idx">${j + 1}</span>${esc(c.name)} <span class="sub">사이트명 · ${esc(c.callName || "확인 필요")}</span></div>` : ""}<div class="code"><div class="code-bar"><span>프롬프트</span><button class="edit" data-edit="p-${i}-${j}">✏️ 수정</button><button class="copy" data-copy="p-${i}-${j}">📋 복사</button></div><pre id="p-${i}-${j}" spellcheck="false">${esc(coachPrompt(ch, c))}</pre></div>`).join("")}`}</div>`).join("");

const G = { must: ["발행 전에 꼭 볼 것", "p-bad"], look: ["한 번 더 읽어 볼 것", "p-warn"], ok: ["잘 들어갔어요", "p-ok"] };
const hot = (item) => /^[🚫🔗]/u.test(item);
const li = (x, checked) => `<li class="${hot(x.item) && !checked ? "hot" : ""}"><label><input type="checkbox" ${checked ? "checked" : ""}> <b>${esc(x.item)}</b>${x.note ? `: ${esc(x.note)}` : ""}</label>${x.quote ? `<blockquote>${esc(x.quote)}</blockquote>` : ""}</li>`;
const oneCheck = (CC) => ["must", "look", "ok"].map((lv) => {
  const xs = CC.items.filter((x) => x.level === lv);
  return xs.length ? `<h4><span class="pill ${G[lv][1]}">${G[lv][0]}</span> ${xs.length}</h4><ul class="chk">${xs.map((x) => li(x, lv === "ok")).join("")}</ul>` : "";
}).join("");
// 크루가 둘 이상이면 「글 전체」와 크루마다 나눠 보여 준다 (item 의 crew 칸 · 없으면 이름으로 찾는다)
const crewOfItem = (x) => x.crew ?? (crews.find((c) => x.item.includes(c.name))?.name || "");
const splitCheck = (CC) => {
  if (crews.length < 2) return oneCheck(CC);
  const common = { items: CC.items.filter((x) => !crewOfItem(x)) };
  return `<div class="grp">이 채널 글 전체</div>${oneCheck(common)}` + crews.map((c) => {
    const xs = { items: CC.items.filter((x) => crewOfItem(x) === c.name) };
    return xs.items.length ? `<div class="sub-crew"><div class="sc-title">${esc(c.name)} <span class="sub">사이트명 · ${esc(c.callName || "확인 필요")}</span></div>${oneCheck(xs)}</div>` : "";
  }).join("");
};
const checkTab = C.length
  ? C.map((CC) => `<div class="card ch">${CC.channel ? `<div class="chhead"><b>${esc(CC.channel)}</b></div>` : ""}${splitCheck(CC)}</div>`).join("")
    + (P.readNotes?.length ? `<div class="card ch"><div class="chhead"><b>Claude 가 글을 읽고 짚은 것</b></div><ul class="chk">${P.readNotes.map((n) => li(n, false)).join("")}</ul></div>` : "")
    + `<p class="tip">이런 게 걸려요. <b>최종 발행 전에 직접 검수해 주세요.</b> 발행은 직접 해요.</p>`
  : `<div class="card locked"><div class="lock-title">🔒 아직 점검 전이에요</div><ol><li>프롬프트나 가이드를 보고 <b>내가 직접</b> 글을 써요</li><li>다 쓴 글을 Claude Code 에 「<b>샤라웃 콘텐츠 점검해 줘</b>」와 함께 붙여 넣어요</li><li>Claude 가 검수하면 이 탭이 열리고 <b>발행 전 체크리스트</b>가 채워져요</li></ol></div>`;

const first = C.length && P.showCheck ? "check" : P.mode === "guide" ? "guide" : "prompt";
const tabBtn = (t, label) => `<button data-t="${t}" class="${first === t ? "on" : ""}${t === "check" && !C.length ? " dim" : ""}">${t === "check" && !C.length ? "🔒 " : ""}${label}</button>`;
const tabDiv = (t, body) => `<div id="t-${t}" class="tab ${first === t ? "on" : ""}">${body}</div>`;

const CSS = `:root{--bg:#f6f6f8;--paper:#fff;--ink:#1f1d26;--sub:#6b6878;--faint:#9a97a6;--line:#e8e6ee;--accent:#5b3fd1;--soft:#f1eefc;--warn:#8a5a0b;--warn-soft:#f8f1e2;--bad:#b42318;--bad-soft:#fdecea;--ok:#1d7a4f;--ok-soft:#e6f4ec}
@media (prefers-color-scheme:dark){:root{--bg:#141319;--paper:#1c1b23;--ink:#e9e7f2;--sub:#a5a2b5;--faint:#77748a;--line:#2e2c39;--accent:#b3a1ff;--soft:#25213a;--warn:#e2b75c;--warn-soft:#2f2715;--bad:#ff8a80;--bad-soft:#3a1d1b;--ok:#7fd3a6;--ok-soft:#163025;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;word-break:keep-all;padding:0 16px}
.wrap{max-width:760px;margin:0 auto;padding:40px 0 80px}.kicker{font-size:12.5px;color:var(--faint)}h1{font-size:25px;line-height:1.4;margin:6px 0 8px}.lede{color:var(--sub);font-size:14.5px;margin:0}
section{margin-top:36px}h2{font-size:18px;margin:0 0 10px;display:flex;align-items:center;gap:8px}h2 .n{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;display:grid;place-items:center}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:12px}
.card.me{border:1.5px solid var(--line)}.card.crew{border:1.5px solid var(--accent)}
.title{font-size:19px;font-weight:800;display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px}.title.small{font-size:15px}.title .sub,.sc-title .sub{font-size:13.5px;font-weight:600;color:var(--sub)}
.idx{width:22px;height:22px;border-radius:6px;background:var(--soft);color:var(--accent);font-size:13px;display:inline-grid;place-items:center;align-self:center}
.row{display:grid;grid-template-columns:130px 1fr;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14.5px}.row .k{font-size:12.5px;font-weight:700;color:var(--sub);padding-top:2px}.row ul,.row ol{margin:0;padding-left:18px}
.row.soft-bad .k,.row.soft-bad .v{color:var(--bad)}.row.soft-acc .k,.row.soft-acc .v{color:var(--accent)}
.url-box{background:var(--soft);border:1.5px solid var(--accent);border-radius:12px;padding:10px 14px;margin:6px 0 8px;font-size:15px}.url-box a{color:var(--accent);font-weight:800;word-break:break-all}.url-box small{display:block;font-size:12.5px;color:var(--sub)}.url-box.tight{padding:8px 12px;font-size:14px}
.no-box{color:var(--bad);padding:8px 0;margin:0;border-top:1px solid var(--line);font-size:14.5px}.no-box ul{margin:4px 0 0;padding-left:18px}.no-box .fix{margin-top:4px;font-weight:700}.no-box.tight{padding:6px 0;font-size:14px}
.tabs{display:flex;gap:6px;margin:4px 0 14px;flex-wrap:wrap}.tabs button{font:inherit;font-size:14px;font-weight:700;border:1.5px solid var(--line);background:var(--paper);color:var(--sub);border-radius:999px;padding:6px 16px;cursor:pointer}.tabs button.on{border-color:var(--accent);background:var(--soft);color:var(--accent)}
.tabs button.dim{opacity:.45;border-style:dashed}.tabs button.dim.on{opacity:.8}
.locked{border:1.5px dashed var(--line);background:var(--bg)}.lock-title{font-weight:800;font-size:16px;margin-bottom:6px}.locked ol{margin:0;padding-left:20px;font-size:14.5px}.locked li{margin:4px 0}
.tab{display:none}.tab.on{display:block}
.chhead{display:flex;gap:8px;align-items:center;font-size:17px;margin-bottom:8px}.grp{margin:14px 0 4px;font-size:12px;font-weight:800;color:var(--accent);letter-spacing:.02em}
.sub-crew{border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-top:8px;background:var(--bg)}.sc-title{font-weight:800;font-size:15.5px;margin-bottom:4px}
.sub-crew .row{grid-template-columns:110px 1fr}
.sns{margin-top:12px;background:var(--warn-soft);color:var(--warn);border-radius:12px;padding:10px 14px;font-size:14px}.sns ul{list-style:none;padding:0;margin:6px 0}.sns small{font-size:12.5px}
.code{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0 0 12px}.code-bar{display:flex;gap:6px;align-items:center;background:var(--soft);padding:6px 10px;font-size:12.5px;font-weight:700;color:var(--accent)}.code-bar span{margin-right:auto}
pre{white-space:pre-wrap;background:var(--bg);padding:12px 14px;font:13px/1.65 ui-monospace,Menlo,monospace;margin:0;max-height:420px;overflow:auto}pre.editing{outline:2px solid var(--accent);background:var(--paper)}
.ubtns{display:inline-flex;gap:4px;margin-left:4px;vertical-align:1px}.ugo{font-size:11.5px;font-weight:700;background:var(--soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:1px 8px;text-decoration:none}
.ucopy{font:inherit;font-size:11.5px;font-weight:700;background:var(--paper);color:var(--accent);border:1px solid var(--line);border-radius:6px;padding:1px 8px;cursor:pointer}
.look li{margin-bottom:6px}.look a{color:var(--accent);font-weight:700}.ldesc{font-size:13.5px;color:var(--sub)}
.edit{font:inherit;font-size:12.5px;font-weight:700;background:var(--paper);color:var(--accent);border:1px solid var(--accent);border-radius:8px;padding:4px 10px;cursor:pointer}
.pc-title{font-weight:800;font-size:15.5px;margin:16px 0 6px;display:flex;align-items:center;gap:8px}.pc-title .sub{font-size:13px;font-weight:600;color:var(--sub)}
.copy{font:inherit;font-size:12.5px;font-weight:700;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:5px 12px;cursor:pointer}
.pill{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px}.p-ok{background:var(--ok-soft);color:var(--ok)}.p-warn{background:var(--warn-soft);color:var(--warn)}.p-bad{background:var(--bad-soft);color:var(--bad)}.p-acc{background:var(--soft);color:var(--accent)}
h4{font-size:14.5px;margin:12px 0 6px}.chk{list-style:none;padding:0;margin:0}.chk li{border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:14px}.chk input{accent-color:var(--accent)}
.chk li.hot b{color:var(--bad)}
blockquote{margin:6px 0 0;padding:6px 10px;border-left:3px solid var(--accent);background:var(--soft);border-radius:0 8px 8px 0;font-size:13.5px}
.what{font-size:13.5px;color:var(--sub);margin:0 0 10px}.muted{color:var(--faint)}.tip{font-size:14px;color:var(--sub)}.tip b{color:var(--ink)}
.steps{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:12px 18px 12px 38px;font-size:14.5px;margin:0}.steps li{margin:4px 0}
.foot{margin-top:40px;font-size:12px;color:var(--faint);border-top:1px solid var(--line);padding-top:12px}
@media (max-width:640px){.row,.sub-crew .row{grid-template-columns:1fr;gap:2px}h1{font-size:21px}}`;
const JS = `document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById('t-'+b.dataset.t).classList.add('on')});
document.querySelectorAll('button.copy').forEach(b=>b.onclick=()=>{const t=document.getElementById(b.dataset.copy).innerText;const done=()=>{b.textContent='✅ 복사했어요';setTimeout(()=>b.textContent='📋 복사',1500)};(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(done).catch(()=>{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();done()})});
document.querySelectorAll('button.ucopy').forEach(b=>b.onclick=()=>{const t=b.dataset.url;const done=()=>{const o=b.textContent;b.textContent='✅ 복사했어요';setTimeout(()=>b.textContent=o,1500)};(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(done).catch(()=>{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();done()})});
document.querySelectorAll('button.edit').forEach(b=>b.onclick=()=>{const p=document.getElementById(b.dataset.edit);const on=p.isContentEditable;p.contentEditable=on?'false':'true';p.classList.toggle('editing',!on);b.textContent=on?'✏️ 수정':'✅ 수정 끝';if(!on)p.focus()});`;

const titleCrews = crews.map((c) => `${esc(c.name)}${c.callName ? ` <span class="h1sub">(사이트명 · ${esc(c.callName)})</span>` : ""}`).join(" · ");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="geo-shoutout · 이니 (iny-young.com)"><title>샤라웃 기획 · ${esc(crews.map((c) => c.name).join(" · "))}</title><style>${CSS}.h1sub{font-size:16px;color:var(--sub);font-weight:600}</style></head><body><div class="wrap">
<div class="kicker">스폰지클럽 4기 GEO 유닛 · 샤라웃 콘텐츠 기획</div>
<h1>${esc(me.name)} 님이 소개할 크루 ${titleCrews}</h1>
<p class="lede">이 리포트는 기획까지예요. <b>글은 내가 직접 쓰고, 검수하고, 발행해요.</b> 기본 과제는 채널 1곳이면 인정이에요.</p>
${meBox}
${crewBox}
<section><h2><span class="n">3</span>어떻게 쓸까요</h2><p class="what">채널마다 정리했어요. 탭을 바꿔 다른 방법으로도 볼 수 있어요.</p>
<div class="tabs">${tabBtn("prompt", "프롬프트로 받기 · 혼자 쓰기 힘들어요")}${tabBtn("guide", "가이드로 받기 · 직접 쓸래요")}${tabBtn("check", "발행 전 체크리스트")}</div>
${tabDiv("prompt", promptTab)}${tabDiv("guide", guideTab)}${tabDiv("check", checkTab)}</section>
<section><h2><span class="n">4</span>다음 순서</h2><ol class="steps"><li>프롬프트나 가이드를 보고 <b>내가 직접</b> 써요</li><li>다 쓴 글을 Claude Code 에 「샤라웃 콘텐츠 점검해 줘」와 함께 붙여요</li><li>체크리스트를 보고 최종 검수한 뒤 <b>직접 발행</b>해요</li><li>「샤라웃 콘텐츠 링크 과제에 넣어 줘」와 함께 링크를 주면 4주차 과제 파일에 넣어 드려요 → 과제를 다 채우면 커밋 · 푸시</li></ol></section>
<div class="foot">geo-shoutout · 스폰지클럽 4기 GEO 유닛 · © 2026 이니 (iny) · 재배포 · 판매 금지</div>
</div><script>${JS}</script></body></html>`;

const out = path.join(dir, path.basename(planPath).replace(/\.plan\.json$/, "") + "-report.html");
fs.writeFileSync(out, html);
console.log(out);
if (args.includes("--open")) execFile(process.platform === "win32" ? "cmd" : "open", process.platform === "win32" ? ["/c", "start", "", out] : [out]);
