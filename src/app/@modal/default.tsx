// Parallel-route default for the `@modal` slot.
//
// Next.js App Router renders every parallel slot alongside `children`. When
// the URL does NOT match a route inside the slot, Next falls through to this
// `default.tsx`. We render nothing so the modal is invisible on non-detail
// URLs. Critical: without this file the slot crashes on hard-navigation for
// any URL the slot doesn't know about.
//
// See: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#defaultjs
export default function Default() {
  return null;
}
