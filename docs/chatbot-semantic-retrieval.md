# Semantic, user-specific chatbot flow

The production `/api/chat` flow understands meaning before selecting data. It does not select a different tool or answer because an unrelated keyword appears in the question.

1. Resolve the authenticated user, company, and active role on the server. Owners and company administrators retain their existing authority rules.
2. Send the question, recent conversation, current page, role responsibilities, and role-allowed capability catalog to the intent model. It returns a validated capability, period, scope, standalone question, and whether approved guidance is needed. A missing essential detail produces one contextual clarification question.
3. Retrieve current records through the selected, enabled, role-approved tools. Use the standalone question to preserve context in follow-ups. Retrieve stable guidance through embeddings and vector similarity when needed, including alongside live records.
4. Send only the authorized results and relevant guidance to the answer provider. Format its response through the existing response renderer and restrict actions to server-approved navigation.

Waiters are one supported role, not the assumed user. Kitchen, procurement, cleaning, drivers, general staff, clients, company administrators, regional and sales administrators, owners, and platform administrators receive their own capability catalog and operating instructions. General staff work now includes their own scheduled shifts and linked tasks. Waiter service records remain limited to the signed-in waiter.

## Retrieval and failure behavior

- Only ready knowledge sources in the current company or shared scope are considered. Role and legacy-role permissions are checked before ranking.
- `match_ai_brain_documents_for_sources` uses cosine similarity within those eligible sources. The materialized eligible set avoids losing all permitted passages to a top-result list dominated by other roles. Duplicate and low-similarity passages are excluded. Source names are passed to the answer model and returned by the API.
- No substring/document scan substitutes for vector search. A missing embedding provider or failed vector query is reported as unavailable, separately from a successful search with no matching passage.
- Primary intent-provider failure tries other configured semantic providers. If all fail, the route does not guess live tools from keywords. Existing deterministic helpers remain available to legacy callers that omit a resolved intent; production passes the resolved semantic intent or explicit `null`.
- Questions needing guidance plus current records use the hybrid route. Retrieved instructions never authorize access to another user's or company's records.

## Deployment and validation

Apply `supabase/migrations/20261124120000_role_scoped_semantic_knowledge.sql` before deploying this retrieval path. Existing knowledge must have valid 1536-dimensional embeddings from the configured embedding model. Use the existing AI Brain resync control if embeddings need rebuilding.

Run `npx jest --runInBand --watch=false --testPathPatterns=chatbot` and `npx tsc --noEmit --incremental false`. The semantic pipeline tests mock provider responses; they verify routing, permissions, context propagation, and rendering, rather than measuring the semantic accuracy of a live model. Live paraphrase quality and deployed database behavior still require validation against the configured providers and database.

The retrieval implementation follows [pgvector's cosine similarity and filtering guidance](https://github.com/pgvector/pgvector#filtering). Exact ranking of the permitted set favors recall and isolation; reassess query latency with the production knowledge volume before changing to approximate retrieval.
