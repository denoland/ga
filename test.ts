// Copyright 2021-2022 the Deno authors. All rights reserved. MIT license.

import { delay } from "https://deno.land/std@0.120.0/async/mod.ts";
import { assertEquals } from "https://deno.land/std@0.120.0/testing/asserts.ts";
import {
  createMockContext,
  createMockNext,
} from "https://deno.land/x/oak@v10.1.0/testing.ts";

import { createReporter, createReportMiddleware } from "./mod.ts";

const mockConn = {
  remoteAddr: {
    hostname: "localhost",
    port: 8080,
    transport: "tcp",
  } as Deno.NetAddr,
};

function setup(): [string, AbortController, Record<string, string>[]] {
  const requests: Record<string, string>[] = [];
  const controller = new AbortController();
  const listener = Deno.listen({ port: 0 });
  const addr = listener.addr as Deno.NetAddr;
  const server = `http://${addr.hostname}:${addr.port}/`;
  controller.signal.addEventListener("abort", () => {
    listener.close();
  });
  (async () => {
    for await (const conn of listener) {
      (async () => {
        const httpConn = Deno.serveHttp(conn);
        while (true) {
          try {
            const requestEvent = await httpConn.nextRequest();
            if (requestEvent) {
              requests.push(
                ...(await requestEvent.request.text()).split("\n").filter((i) =>
                  !!i
                ).map((i) => Object.fromEntries(new URLSearchParams(i))),
              );
              await requestEvent.respondWith(
                new Response(null, { status: 200 }),
              );
            } else {
              return;
            }
          } catch {
            return;
          }
        }
      })();
    }
    console.log("end server");
  })();
  return [server, controller, requests];
}

Deno.test({
  name: "createReporter - defaults",
  async fn() {
    const msgs: string[] = [];
    const reporter = createReporter({
      log(msg) {
        msgs.push(msg);
      },
    });
    await reporter(
      new Request("http://localhost/"),
      mockConn,
      new Response(),
      0,
    );
    assertEquals(msgs, [
      "GA_TRACKING_ID environment variable not set. Google Analytics reporting disabled.",
    ]);
  },
});

Deno.test({
  name: "createReporter - basic usage",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const [endpoint, controller, requests] = setup();
    const logMsgs: string[] = [];
    const report = createReporter({
      id: "UA-XXXX-Y",
      endpoint,
      log(msg) {
        logMsgs.push(msg);
      },
    });
    const start = performance.now();
    await report(
      new Request("http://localhost/example"),
      mockConn,
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      start,
    );
    await delay(1_200);
    controller.abort();
    assertEquals(logMsgs.length, 0);
    assertEquals(requests.length, 1);
    assertEquals(Object.keys(requests[0]), [
      "v",
      "tid",
      "t",
      "cid",
      "uip",
      "dl",
      "srt",
      "qt",
    ]);
    assertEquals(requests[0].v, "1");
    assertEquals(requests[0].tid, "UA-XXXX-Y");
    assertEquals(requests[0].t, "pageview");
    assertEquals(requests[0].uip, "localhost");
    assertEquals(requests[0].dl, "http://localhost/example");
  },
});

Deno.test({
  name: "createReportMiddleware - basic usage",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const [endpoint, controller, requests] = setup();
    const logMsgs: string[] = [];
    const mw = createReportMiddleware({
      id: "UA-XXXX-Y",
      endpoint,
      log(msg) {
        logMsgs.push(msg);
      },
    });
    const ctx = createMockContext({
      ip: "127.0.0.1",
      path: "/example",
    });
    const next = createMockNext();
    await mw(ctx, next);
    await delay(1_200);
    controller.abort();
    assertEquals(logMsgs.length, 0);
    assertEquals(requests.length, 1);
    assertEquals(Object.keys(requests[0]), [
      "v",
      "tid",
      "t",
      "cid",
      "uip",
      "dl",
      "exd",
      "exf",
      "qt",
    ]);
    assertEquals(requests[0].v, "1");
    assertEquals(requests[0].tid, "UA-XXXX-Y");
    assertEquals(requests[0].t, "pageview");
    assertEquals(requests[0].uip, "127.0.0.1");
    assertEquals(requests[0].dl, "http://localhost/example");
  },
});
