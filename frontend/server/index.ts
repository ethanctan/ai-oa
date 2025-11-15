import { createRequestHandler } from "@remix-run/vercel";
import * as build from "../build/server/index.js";

export default createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});

// Disable Vercel's default body parsing so Remix can handle the request stream.
export const config = {
  api: {
    bodyParser: false,
  },
};

