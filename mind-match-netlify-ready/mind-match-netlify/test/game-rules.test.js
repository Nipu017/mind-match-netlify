import test from "node:test";
import assert from "node:assert/strict";
function normalizeAnswer(value) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/[.!?,;:'"()[\]{}]/g, "").replace(/\s+/g, " ");
}
function scoreRound(entries) {
  const groups = new Map();
  for (const [player, answer] of Object.entries(entries)) {
    if (!answer?.trim()) continue;
    const key = normalizeAnswer(answer);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  }
  const max = Math.max(0, ...[...groups.values()].map(g => g.length));
  const winners = max >= 2 ? [...groups.values()].filter(g => g.length === max).flat() : [];
  return {max, winners, groups};
}
test("normalizes case, whitespace, and punctuation",()=>{
  assert.equal(normalizeAnswer("  BANANA! "), "banana");
  assert.equal(normalizeAnswer("green   apple"), "green apple");
});
test("largest group wins and smaller groups get no points",()=>{
  const result=scoreRound({a:"banana",b:"BANANA",c:"mango",d:"lemon",e:"pineapple"});
  assert.equal(result.max,2);
  assert.deepEqual(result.winners,["a","b"]);
});
test("ties for largest group award all tied groups",()=>{
  const result=scoreRound({a:"banana",b:"banana",c:"mango",d:"mango",e:"lemon"});
  assert.equal(result.max,2);
  assert.deepEqual(result.winners,["a","b","c","d"]);
});
test("all unique answers award no points",()=>{
  const result=scoreRound({a:"banana",b:"mango",c:"lemon"});
  assert.equal(result.winners.length,0);
});
test("blank answers are ignored and a lone answer does not score",()=>{
  const result=scoreRound({a:"banana",b:"",c:"   "});
  assert.deepEqual(result.winners,[]);
});
