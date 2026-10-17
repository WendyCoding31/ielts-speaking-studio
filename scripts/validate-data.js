#!/usr/bin/env node

"use strict";

global.window = {};
require("../data.js");
require("../groups.js");

const sets = window.SEED_SETS || [];
const packs = window.MATERIAL_PACKS || [];
const errors = [];

if (sets.length !== 84) errors.push(`预期 84 组题，实际 ${sets.length} 组`);
if (sets.filter((set) => set.part === 1).length !== 37) errors.push("Part 1 组数不是 37");
if (sets.filter((set) => set.part === 2).length !== 47) errors.push("Part 2 & 3 组数不是 47");

const ids = new Set();
for (const set of sets) {
  if (!set.id) errors.push("发现缺少 id 的题组");
  if (ids.has(set.id)) errors.push(`重复题组 id：${set.id}`);
  ids.add(set.id);

  if (set.part === 1) {
    if (!Array.isArray(set.questions) || !set.questions.length) {
      errors.push(`${set.id} 没有 Part 1 问题`);
    }
    for (const question of set.questions || []) {
      if (!question.q || !question.a) errors.push(`${set.id} 存在缺少题目或默认答案的 Part 1 数据`);
    }
  } else if (set.part === 2) {
    if (!set.cue || !set.modelAnswer) errors.push(`${set.id} 缺少 Cue Card 或默认 Part 2 答案`);
    for (const question of set.part3 || []) {
      if (!question.q || !question.a) errors.push(`${set.id} 存在缺少题目或默认答案的 Part 3 数据`);
    }
  } else {
    errors.push(`${set.id} 的 part 值非法：${set.part}`);
  }
}

const grouped = [];
for (const pack of packs) {
  for (const id of pack.ids || []) {
    if (!ids.has(id)) errors.push(`${pack.id} 引用了不存在的题组：${id}`);
    if (grouped.includes(id)) errors.push(`题组被重复分组：${id}`);
    grouped.push(id);
  }
}

if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

const part1Questions = sets
  .filter((set) => set.part === 1)
  .reduce((sum, set) => sum + set.questions.length, 0);
const part3Questions = sets
  .filter((set) => set.part === 2)
  .reduce((sum, set) => sum + (set.part3 || []).length, 0);

console.log(
  `题库校验通过：${sets.length} 组，` +
  `Part 1 短问 ${part1Questions} 道，Part 2 Cue Card 47 道，` +
  `Part 3 问题 ${part3Questions} 道，素材分组 ${packs.length} 个。`
);
