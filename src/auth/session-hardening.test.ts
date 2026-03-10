import test from "node:test";
import assert from "node:assert/strict";
import { computeSessionHardeningScore } from "./session-hardening";

test("returns 0 for invalid inputs", () => {
  assert.equal(computeSessionHardeningScore(0, 60), 0);
  assert.equal(computeSessionHardeningScore(60, 0), 0);
  assert.equal(computeSessionHardeningScore(-1, 10), 0);
});

test("returns 90 when idle timeout is <=25% of ttl", () => {
  assert.equal(computeSessionHardeningScore(100, 25), 90);
  assert.equal(computeSessionHardeningScore(200, 40), 90);
});

test("returns 75 when idle timeout is <=50% of ttl", () => {
  assert.equal(computeSessionHardeningScore(100, 50), 75);
  assert.equal(computeSessionHardeningScore(120, 55), 75);
});

test("returns 60 when idle timeout is <=75% of ttl", () => {
  assert.equal(computeSessionHardeningScore(100, 70), 60);
  assert.equal(computeSessionHardeningScore(200, 150), 60);
});

test("returns 45 when idle timeout is above 75% of ttl", () => {
  assert.equal(computeSessionHardeningScore(100, 80), 45);
  assert.equal(computeSessionHardeningScore(100, 100), 45);
});
