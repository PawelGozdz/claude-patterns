# Context Isolation Pattern - Anthropic-Inspired

## Problem
Main context przepełnia się przez:
- Czytanie wszystkich plików (20-40K tokens)
- Implementację + testy + docs w jednym kontekście (100K+ tokens)
- Debugging i iteracje (kolejne 20-40K tokens)
- **Result**: 75% context window usage, slow iterations

## Solution (Anthropic "Effective Harnesses" Pattern)

### 1. Delegacja do wyspecjalizowanych agentów w OSOBNYCH kontekstach

```typescript
// ❌ BEFORE (Main context robi wszystko):
Main Context:
  → Read 10 files (30K tokens)
  → Implement feature (20K tokens)
  → Read test examples (15K tokens)
  → Write tests (25K tokens)
  → Update docs (10K tokens)
  Total: 100K tokens in main context

// ✅ AFTER (Agent delegation):
Main Context:
  → Read 2 key files (8K tokens)
  → Implement feature (20K tokens)
  → Call testing agent with minimal input (0.5K tokens)
  → Receive summary: "✅ 15 tests, 92% coverage" (0.2K tokens)
  → Call docs agent with file path (0.3K tokens)
  → Receive: "✅ Updated BUSINESS_RULES.md" (0.1K tokens)
  Total: 29K tokens in main context (71% savings!)
```

### 2. Structured Artifacts (jak "claude-progress.txt" u Anthropic)

**Project już ma** (częściowo):
- ✅ `BUSINESS_RULES.md` - feature list z test coverage matrix
- ✅ `project-orchestration/tasks/` - task tracking
- ✅ Git commits z opisami
- ⏳ **BRAKUJE**: Automatic session tracker

**Co dodamy**:

```json
// project-orchestration/sessions/current.json
{
  "session_id": "2025-12-06-001",
  "task": "TS-TEST-OPENAPI-001",
  "completed_steps": [
    {
      "agent": "@domain-application-implementer",
      "action": "Implemented OpenAPI loader",
      "files": ["test/shared/openapi/schema-loader.ts"],
      "tokens_main_context": 12000,
      "status": "✅"
    },
    {
      "agent": "@infrastructure-testing-implementer",
      "action": "Created schema tests",
      "tokens_agent_context": 18000,  // OSOBNY kontekst
      "tokens_main_context": 200,     // tylko summary
      "result": "15 tests, 94% coverage",
      "status": "✅"
    }
  ],
  "next_actions": ["Generate endpoint extractor"]
}
```

### 3. Testing Delegation Protocol (IMMEDIATE WIN)

**Pattern**: Main agent NIGDY nie pisze testów bezpośrednio

#### Main Agent (@domain-application-implementer):
```markdown
1. Implement business logic
2. Update BUSINESS_RULES.md with BR-XXX-001 entry
3. Call testing agent with MINIMAL context:
   - File path(s)
   - Business rule IDs (BR-XXX-001, BR-XXX-002)
   - Expected behavior (1-2 sentences)
4. Receive summary (< 200 tokens)
5. Continue with next feature
```

#### Testing Agent Input (MINIMAL):
```json
{
  "file_path": "src/contexts/geographic-auth/domain/aggregates/verification.aggregate.ts",
  "business_rules": ["BR-GEO-001", "BR-GEO-002"],
  "expected_behavior": "Should validate location within 100m radius and reject outside boundary",
  "test_type": "L1-Spec + L2-Handler"
}
```

#### Testing Agent Output (SUMMARY ONLY):
```json
{
  "status": "✅",
  "tests_created": 15,
  "coverage": "92%",
  "files": [
    "src/contexts/geographic-auth/domain/specifications/__tests__/location-boundary.spec.ts",
    "src/contexts/geographic-auth/application/commands/__tests__/verify-location.handler.spec.ts"
  ],
  "BUSINESS_RULES_updated": true,
  "tokens_used_in_agent_context": 22000
}
```

**Main context savings**: 22K tokens → 200 tokens (99% reduction for testing phase!)

### 4. Specialized Agent Patterns

#### Pattern A: Schema Testing Agent
```typescript
Input:
  - schema_file: "src/shared/validation/schemas/auth/auth-schemas.ts"
  - schemas_to_test: ["loginRequestSchema", "registerRequestSchema"]

Agent Context (separate):
  - Reads schema file
  - Reads testing pattern template
  - Generates 6-category tests (Valid, Invalid, Security, etc.)
  - Runs tests
  - Updates BUSINESS_RULES.md

Output to Main:
  - "✅ 45 tests created, 100% passing, BUSINESS_RULES.md updated"
```

#### Pattern B: Documentation Agent
```typescript
Input:
  - aggregate_file: "src/contexts/auth/domain/aggregates/user.aggregate.ts"
  - handler_file: "src/contexts/auth/application/commands/register-user/handler.ts"

Agent Context (separate):
  - Reads implementation files
  - Reads DOMAIN.md template
  - Generates/updates BUSINESS_RULES.md
  - Creates Gherkin scenarios

Output to Main:
  - "✅ BUSINESS_RULES.md: Added BR-AUTH-003, Gherkin scenario created"
```

#### Pattern C: E2E Testing Agent
```typescript
Input:
  - api_endpoint: "POST /api/v1/auth/register"
  - business_rules: ["BR-AUTH-001", "BR-AUTH-002"]
  - security_requirements: ["Rate limiting", "CSRF protection"]

Agent Context (separate):
  - Reads BUSINESS_RULES.md
  - Generates E2E test scenarios
  - Implements using abstracted test setup
  - Validates L3-API coverage

Output to Main:
  - "✅ 8 E2E tests, L3-API coverage complete for BR-AUTH-001, BR-AUTH-002"
```

### 5. Session Initialization Pattern (Anthropic "Initializer Agent")

**New Agent**: `@project-session-initializer`

**Responsibilities**:
```markdown
1. Read git branch name
2. Read last 5 git commits
3. Read BUSINESS_RULES.md for current context
4. Read current task from project-orchestration/tasks/
5. Create session plan:
   - Current state summary
   - Next priority action
   - Required files (minimal list)
   - Agent delegation plan
6. Create current-session.json
```

**Output** (< 1000 tokens):
```json
{
  "session_summary": "Branch: feature/TS-TEST-OPENAPI-001. Last commit: Created schema loader. Next: endpoint extractor.",
  "required_files": [
    "test/shared/openapi/schema-loader.ts",
    "contexts/geographic-auth/BUSINESS_RULES.md"
  ],
  "next_action": "Implement endpoint extractor with geographic filtering",
  "agent_delegation_plan": {
    "implementation": "@domain-application-implementer",
    "testing": "@infrastructure-testing-implementer",
    "security_review": "@security-e2e-verifier"
  },
  "estimated_tokens_main_context": 35000
}
```

## Implementation Phases

### Phase 1: Testing Delegation (Week 1) - IMMEDIATE WIN ⚡
**Effort**: 1 day
**Token Savings**: 40-60% per feature

```bash
# Changes required:
1. Update agent prompts (.claude/agents/*):
   - Add explicit testing delegation instruction
   - Add "return summary only" requirement

2. Create delegation template:
   .claude/patterns/test-delegation-template.md

3. Test with current task (TS-TEST-OPENAPI-001):
   - Main: Implement endpoint extractor
   - Delegate: Testing to @infrastructure-testing-implementer
   - Measure token savings
```

**Expected Results**:
- Main context: 80K → 35K tokens (56% reduction)
- Testing agent context: 25K tokens (isolated)
- Total project tokens: Same, but main context freed

### Phase 2: Session Tracking (Week 2)
**Effort**: 3 days
**Benefits**: Better coordination, clearer progress

```bash
# Create:
1. project-orchestration/sessions/current.json
2. Update @project-project-orchestrator to maintain session state
3. Add session initialization step to workflow

# Integration:
- Git pre-commit hook: Update current.json
- Agent completion: Append to session log
```

### Phase 3: Specialized Context-Isolated Agents (Week 3)
**Effort**: 5 days
**Token Savings**: 60-70% per feature

```bash
# New agents with explicit context isolation:
1. @schema-testing-agent
   - Input: Schema file path + schema names
   - Output: Test count, coverage, status

2. @documentation-agent
   - Input: Implementation file paths
   - Output: BUSINESS_RULES.md updated confirmation

3. @security-audit-agent (isolated context)
   - Input: Endpoint paths + business rules
   - Output: Security findings summary
```

## Metrics to Track

### Current State (Baseline):
```
Feature Implementation:
├─ Main context tokens: 120K-150K (75% window usage)
├─ Agent handoffs: 3-5 per feature
├─ Context window exhaustion: 30% of features
└─ Re-reading files: 15-20 files per feature
```

### Target State (After Full Implementation):
```
Feature Implementation:
├─ Main context tokens: 30K-50K (25% window usage)
├─ Agent handoffs: 10-15 per feature (but isolated!)
├─ Context window exhaustion: <5% of features
└─ Re-reading files: 3-5 files in main context
└─ Token savings: 60-70% in main context
└─ Total tokens: Similar, but distributed across isolated contexts
```

## Critical Success Factors

### 1. Minimal Agent Input (Anthropic Principle)
❌ **DON'T** send entire codebase context to agents
✅ **DO** send only:
- File paths (not content - agent reads in own context)
- Business rule IDs (agent reads BUSINESS_RULES.md)
- Expected behavior (1-2 sentences)

### 2. Summary-Only Output
❌ **DON'T** return full test code to main context
✅ **DO** return:
- Status (✅/❌)
- Metrics (count, coverage)
- File paths (for reference)
- Git commit hash (if committed)

### 3. Structured Artifacts (Anthropic "Feature List")
✅ **Use** BUSINESS_RULES.md as single source of truth
✅ **Update** BUSINESS_RULES.md in agent context (not main)
✅ **Verify** coverage in main context (just read status)

## Example: Full Feature Flow with Context Isolation

**Task**: Implement "Job Offer Submission" (local-services context)

### Traditional Approach (150K tokens main context):
```
Main Context:
1. Read BUSINESS_RULES.md (5K)
2. Read domain patterns (10K)
3. Read existing aggregates (15K)
4. Implement aggregate (10K)
5. Read CQRS patterns (8K)
6. Implement handler (12K)
7. Read test patterns (10K)
8. Implement L1 tests (15K)
9. Implement L2 tests (18K)
10. Read E2E patterns (7K)
11. Implement E2E tests (20K)
12. Update docs (10K)
13. Debug issues (10K)
TOTAL: 150K tokens
```

### Context Isolation Approach (35K main + 80K distributed):
```
Main Context (35K):
1. Initialize session (2K)
2. Read BUSINESS_RULES.md excerpt (2K)
3. Call @domain-application-implementer:
   - Input: "Implement JobOffer aggregate, BR-LS-001" (0.3K)
   - Agent works in SEPARATE context (25K)
   - Output: "✅ Aggregate implemented, 8 L1 tests passing" (0.2K)
4. Verify aggregate exists (1K)
5. Call @infrastructure-testing-implementer:
   - Input: "Create L2 handler tests for SubmitJobOfferHandler" (0.3K)
   - Agent works in SEPARATE context (30K)
   - Output: "✅ 12 L2 tests, 94% coverage" (0.2K)
6. Call @security-e2e-verifier:
   - Input: "E2E tests for POST /api/v1/local-services/job-offers" (0.3K)
   - Agent works in SEPARATE context (25K)
   - Output: "✅ 15 E2E tests, security validated" (0.2K)
7. Call @documentation-agent:
   - Input: "Update BUSINESS_RULES.md for BR-LS-001" (0.2K)
   - Agent works in SEPARATE context (5K)
   - Output: "✅ BR-LS-001 documented with Gherkin" (0.1K)
8. Final verification (3K)

Main Context TOTAL: 35K (77% reduction!)
Distributed Contexts: 85K (isolated, parallel possible)
```

## Risk Mitigation

### Risk 1: Lost Context Between Agents
**Mitigation**:
- BUSINESS_RULES.md as single source of truth
- current-session.json tracks all agent outputs
- Git commits preserve full history
- Agent outputs include file paths for verification

### Risk 2: Coordination Overhead
**Mitigation**:
- @project-project-orchestrator owns coordination
- Structured agent input/output contracts
- Session initialization provides clear plan

### Risk 3: Debugging Complexity
**Mitigation**:
- Session logs include full agent context references
- Git history preserves all changes
- Agent outputs include test status (can re-run)
- Failed agents return detailed error summary

## Immediate Action Items

### Day 1: Testing Delegation
- [ ] Update @domain-application-implementer prompt
- [ ] Update @infrastructure-testing-implementer prompt
- [ ] Create test-delegation-template.md
- [ ] Test with TS-TEST-OPENAPI-001
- [ ] Measure token savings

### Day 2-3: Session Tracker
- [ ] Create session.json schema
- [ ] Implement session initialization
- [ ] Update orchestrator to maintain sessions

### Week 2-3: Full Rollout
- [ ] Create specialized agents
- [ ] Implement all delegation patterns
- [ ] Document lessons learned
- [ ] Measure final metrics

## Conclusion

**HIGHLY VIABLE** - Anthropic pattern perfectly matches our needs:
- ✅ Infrastructure 70% ready (Task tool, BUSINESS_RULES.md, orchestrator)
- ✅ Immediate wins possible (testing delegation in 1 day)
- ✅ Token savings: 60-70% in main context
- ✅ Better agent specialization
- ✅ Clearer progress tracking

**Recommended**: Start with Phase 1 (testing delegation) IMMEDIATELY.
Expected ROI: 50-60% token reduction within 1 week.
