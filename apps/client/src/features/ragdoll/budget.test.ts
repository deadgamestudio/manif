import { expect, test } from "bun:test";
import { createRagdollBudget } from "./budget.ts";

test("the budget refuses past the cap and frees slots", () => {
  const budget = createRagdollBudget(2);
  const [a, b, c] = [{}, {}, {}];
  expect(budget.acquire(a)).toBe(true);
  expect(budget.acquire(a)).toBe(true);
  expect(budget.acquire(b)).toBe(true);
  expect(budget.acquire(c)).toBe(false);
  expect(budget.active()).toBe(2);
  budget.release(c);
  expect(budget.active()).toBe(2);
  budget.release(a);
  budget.release(a);
  expect(budget.active()).toBe(1);
  expect(budget.acquire(c)).toBe(true);
  expect(budget.acquire(a)).toBe(false);
});
