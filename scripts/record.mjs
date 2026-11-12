#!/usr/bin/env node
// 올린 글 링크를 내 N주차_<활동명>.md 「📣 샤라웃 · ### 발행」 칸에 넣는다. 내 파일만 고치고, 커밋 · 푸시는 하지 않는다.
// 쓰는 법: node record.mjs --cards <기록 폴더>/cards.json --fact "<직접 본 것 한 문장>" --place "<올린 곳>" --link "<주소>" [--place "<두 번째 곳>" --link "<주소>"] [--sns]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const all = (k) => args.map((a, i) => (a === k ? args[i + 1] : null)).filter((v) => v != null);
const one = (k) => all(k)[0];
const cardsPath = one("--cards");
if (!cardsPath) { console.error("쓰는 법: node record.mjs --cards <기록 폴더>/cards.json --fact … --place … --link …"); process.exit(1); }
const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));
const file = path.join(cards.repo, cards.file);
const md = fs.readFileSync(file, "utf8");

const places = all("--place"), links = all("--link");
if (!links.length) { console.error("--link 가 없어요."); process.exit(1); }
const lines = [`- 내가 직접 본 사실 한 문장 : ${one("--fact") || ""}`.trimEnd()];
links.forEach((l, i) => { lines.push(`- 올린 곳 : ${places[i] || ""}`.trimEnd()); lines.push(`- 발행한 링크 : ${l}`); });
lines.push(`- [${args.includes("--sns") ? "x" : " "}] 공통 SNS 과제로도 올렸어요 (스폰지타임즈 규칙 · 해시태그 · 태그 · 슬랙 /SNS 인증까지)`);

// 「### 발행」 칸만 바꾼다 (다음 「---」 · 「##」 · 「###」 전까지)
const re = /(### 발행\n)([\s\S]*?)(?=\n---|\n##|\n###|$)/;
if (!re.test(md)) { console.error("내 파일에서 「### 발행」 칸을 찾지 못했어요. 직접 붙여 넣어 주세요:\n" + lines.join("\n")); process.exit(2); }
fs.writeFileSync(file, md.replace(re, `$1${lines.join("\n")}\n`));
console.log(JSON.stringify({ ok: true, file, written: lines }, null, 2));
