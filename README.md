# ga

[![oak ci](https://github.com/denoland/ga/workflows/ci/badge.svg)](https://github.com/denoland/ga)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https/deno.land/x/g_a/mod.ts)

Utilities for server side processing of Google Analytics in Deno CLI and Deploy.

When you server side render pages, it can be more efficient to not add Google
Analytics to the client side app, and instead send the messages directly via
your edge worker. This library provides a framework for doing this.

## Usage

The library is designed to generate a measure message for each request and
response handled by a Deno CLI or Deno Deploy server. These messages are then
queued up and asynchronously batched to Google Analytics.

### `createReporter()`

If you are using the Deno HTTP APIs directly, `std/http`, or various other HTTP
frameworks, `createReporter()` will return a function which can be used to
dispatch messages to Google Analytics.

You need to create the reporter function, and then call the reporter with
information about the current request and response.

```ts
import { createReporter } from "https://deno.land/x/g_a/mod.ts";

const reporter = createReporter();
```

If you are using the
[low-level Deno API](https://deno.land/manual/runtime/http_server_apis_low_level)
for HTTP servers, usage of the reporter would look something like this:

```ts
import { createReporter } from "https://deno.land/x/g_a/mod.ts";

const ga = createReporter();

for await (const conn of Deno.listen({ port: 0 })) {
  (async () => {
    const httpConn = Deno.serveHttp(conn);
    for await (const requestEvent of httpConn) {
      let err;
      const start = performance.now();
      try {
        // processing of the request...
        const response = new Response(/* response details */);
        await requestEvent.respondWith(response);
      } catch (e) {
        err = e;
      } finally {
        await ga(requestEvent.request, conn, response, start, err);
      }
    }
  })();
}
```

If you are using the
[`std` library HTTP API](https://deno.land/manual@v1.17.2/runtime/http_server_apis)
then it would look something like this:

```ts
import { createReporter } from "https://deno.land/x/g_a/mod.ts";
import { serve } from "https://deno.land/std/http/server.ts";
import type { ConnInfo } from "https://deno.land/std/http/server.ts";

const ga = createReporter();

function handler(req: Request, conn: ConnInfo) {
  let err;
  let res: Response;
  const start = performance.now();
  try {
    // processing of the request...
    res = new Response(/* response details */);
  } catch (e) {
    err = e;
  } finally {
    ga(req, conn, res!, start, err);
  }
  return res!;
}

serve(handler);
```

### `createReportMiddleware()`

If you are using [oak](https://deno.land/x/oak/), then
`createReportMiddleware()` can be used to create middleware which will

```ts
import { createReportMiddleware } from "https://deno.land/x/g_a/mod.ts";
import { Application } from "https://deno.land/x/oak/mod.ts";

const ga = createReportMiddleware();
const app = new Application();

app.use(ga);
// register additional middleware...

app.listen({ port: 0 });
```
