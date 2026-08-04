# On-demand AI assistance

Skill Atlas keeps deterministic local behavior as the default. OpenAI or DeepSeek is contacted only after the user selects a clearly labeled AI action. Loading a page, typing, searching, scanning, opening a review, and running local recommendations do not call an external model.

## Available actions

| Action | Explicit entry | Data sent | What AI may return | What AI cannot do |
| --- | --- | --- | --- | --- |
| Task recommendation | **AI deep match** | Task text plus a bounded catalog of installed Skill metadata | Ranked installed Skills and reasons | Invent a Skill or invoke it |
| Skill composition | **Compose Skills** | Task text plus 2–8 selected Skills | Ordered handoffs and a copyable combined Prompt | Run Codex or execute the Prompt |
| Market-candidate ranking | **Rank candidates with AI** | Task text, the bounded uninstalled results returned by the marketplaces, and a bounded installed catalog | Rank those exact candidates, explain capability gaps, and identify installed complements | Invent a market result, claim it is installed, or add it to a flow |
| Installation explanation | **Explain with AI** | The already-generated review, bounded file list, and deterministic risks | Plain-language strengths, concerns, and questions | Override a blocking risk or install files |
| Update summary | **Summarize with AI** | The already-generated comparison, bounded change list, and risks | Impact summary and an advisory recommendation | Apply, download, or roll back an update |
| Personal assistant | **Analyze my usage** | Favorite, pinned, and recent Skill IDs; zero-result query text; aggregate copy timing | Reuse suggestions and example tasks | Read personal note bodies or infer private facts |

## Request contract

- Each request is initiated by one user click and makes at most one provider request.
- Requests time out after 30 seconds and are not retried automatically.
- The configured provider is never silently replaced by another provider after a failure.
- Task and catalog context are bounded before leaving the local process.
- Skill metadata, task text, file paths, and risk text are treated as untrusted data and cannot change system instructions.
- Provider output must be a JSON object that passes an action-specific schema.
- Referenced Skill names must exactly match the bounded installed catalog.
- Market recommendations must use exact candidate IDs from the immediately preceding marketplace search. Results already installed locally, marked as duplicates, repeated under the same Skill name, or unrelated leaderboard entries are removed before the provider call.
- Chinese requests must contain Chinese explanatory prose while preserving exact Skill names.
- A deterministically blocked installation can only receive a `do-not-install` AI verdict.

If configuration is missing, the provider fails, or validation rejects the response, the existing local result remains visible. AI advice is never a security authority or proof that an action completed.

## Cost and privacy expectations

Every AI button explains what will be sent before the request. The interface displays the provider on generated advice. Personal note bodies are deliberately excluded from the personal-assistant payload. API keys stay server-side and are never added to provider prompts.

Because providers charge and retain data according to the user's own account and provider policy, users should avoid entering secrets in task descriptions, search text, Skill metadata, or personal notes.

## Marketplace discovery boundary

**Search market candidates** calls the configured SkillsMP and skills.sh adapters, not the AI provider. The user must click **Rank candidates with AI** separately before market results are sent to OpenAI or DeepSeek. Market candidates use an amber **Not installed** treatment and cannot be invoked or added to a composition. **Review and install** explicitly starts the same deterministic GitHub inspection used by marketplace results; AI explanation remains optional, and the user must separately acknowledge the review and confirm installation before any file is written.
