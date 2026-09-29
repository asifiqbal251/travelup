// Stub for '@/lib/PageNotFound' in the flow-test esbuild bundle. The real
// module pulls in the browser-only Base44 client, which isn't relevant to
// Door2Plan (the "?key=door2" gate never renders it in these tests) and
// isn't safe to import in this jsdom harness. Wired in via `alias` (not an
// esbuild plugin) so esbuild's synchronous build API can be used —
// `buildSync` cannot use plugins, and the async `build()` API's persistent
// esbuild service process was found to make `node --test`'s per-file
// process isolation hang indefinitely (see domHarness.js).
export default function PageNotFound() {
  return null;
}
