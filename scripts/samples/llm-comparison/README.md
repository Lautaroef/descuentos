# LLM Comparison — Empirical Test Results

Date: 2026-04-18. Related analysis: `docs/firecrawl-alternative-analysis.md`.

## What was tested

The goal was to run the v2 MODO extraction prompt against multiple LLM providers
(Claude Haiku 4.5, Sonnet 4.6, GPT-5-mini, GPT-5-nano, Gemini 2.5/3 Flash, Gemini
3.1 Pro) using the COTO and Supermiércoles sample pages in `../modo-stress/`,
then compare schema-validation pass rate, field accuracy, latency, and cost.

## What was actually run

**Only Firecrawl `firecrawl_extract` was available as a callable baseline in
this research session.** No direct Gemini / OpenAI / Anthropic MCP tools were
surfaced in the environment (verified via `ToolSearch` queries for
"gemini ask", "openai gpt", "anthropic claude"). The user's top-level
`~/.claude/CLAUDE.md` mentions "gemini-pro-latest" and "gpt-5.4" AI companion
MCPs, but those are not bound in this sub-agent's tool list.

## Baseline result (Firecrawl, already captured)

Firecrawl `firecrawl_extract` v2 prompt results are in
`../modo-stress/extraction-sweep.json`. 10/10 schema-valid. Cost 25-31 credits
per page. Firecrawl does not surface which LLM it uses internally or per-call
token counts — that's the opacity the user's thesis is pushing against.

## What's missing

A real A/B on Haiku 4.5 / GPT-5-mini / Gemini Flash against the SAME COTO and
Supermiércoles inputs. Required to raise confidence from medium to high.
Blocker: need to either (a) install an Anthropic / OpenAI / Google MCP adapter
in this sandbox, or (b) have the user run a small `scripts/benchmark-llm.ts`
one-shot with real API keys. Spec for that benchmark is in the analysis doc
under "Migration path".

## Data available for re-running

- `../modo-stress/coto-mar26.md` — pre-trimmed markdown, 321 words / 2.3 KB.
  Represents lower bound of input size (main-content distilled). Real
  `firecrawl_scrape onlyMainContent:true` output would be closer to 1-2k tokens.
- `../modo-stress/extraction-sweep.json` — 10 known-good extractions as ground
  truth for scoring.
- The v2 prompt verbatim in `../../../docs/modo-stress-test.md`.

When the API keys are in place, the benchmark script should:

1. For each sample page, run the v2 prompt through each candidate model's
   structured-output API with the `Promo` Zod schema translated to JSON Schema.
2. Record: `schema_valid`, per-field diff vs. ground truth, `latency_ms`,
   `input_tokens`, `output_tokens`, computed `$/call`.
3. Score overall: pass rate, field accuracy, cost/call, p95 latency.
