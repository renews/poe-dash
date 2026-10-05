import type { EventEmitter } from "node:events";

export function bindProxyCancellation(
  request: EventEmitter,
  response: EventEmitter & { writableEnded: boolean },
  upstream: { abort: () => void },
) {
  const cleanup = () => {
    request.off("aborted", cancel);
    response.off("close", onClose);
    response.off("finish", cleanup);
  };
  const cancel = () => {
    cleanup();
    upstream.abort();
  };
  const onClose = () => {
    if (!response.writableEnded) cancel();
    else cleanup();
  };
  request.once("aborted", cancel);
  response.once("close", onClose);
  response.once("finish", cleanup);
}
