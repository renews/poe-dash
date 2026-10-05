import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { bindProxyCancellation } from "../electron/app/services/proxyCancellation";

test("cancels the upstream request when its client disconnects", () => {
  const req = new EventEmitter();
  const res = Object.assign(new EventEmitter(), { writableEnded: false });
  let aborted = 0;
  bindProxyCancellation(req, res, {
    abort: () => {
      aborted++;
    },
  });
  res.emit("close");
  req.emit("aborted");
  expect(aborted).toBe(1);
  expect(req.listenerCount("aborted")).toBe(0);
});

test("does not abort a completed response and removes disconnect listeners", () => {
  const req = new EventEmitter();
  const res = Object.assign(new EventEmitter(), { writableEnded: false });
  let aborted = 0;
  bindProxyCancellation(req, res, {
    abort: () => {
      aborted++;
    },
  });
  res.writableEnded = true;
  res.emit("finish");
  res.emit("close");
  expect(aborted).toBe(0);
  expect(req.listenerCount("aborted")).toBe(0);
});
