# Default Agent Configuration - Architectural Analysis

## Executive Summary

This document analyzes multiple architectural approaches for implementing a default agent configuration in LibreChat that:
1. Automatically sets the endpoint to "agents" for all users with USER role
2. Pre-selects a specific agent (by agent_id) defined in librechat.yaml
3. Makes this configuration persistent and enforced by Docker Compose
4. Minimizes changes to the existing codebase

**Recommended Solution**: **Solution 2 - Agents Endpoint Configuration Extension** (See detailed comparison below)

---

## Table of Contents

1. [Background & Requirements](#background--requirements)
2. [Existing Architecture Patterns](#existing-architecture-patterns)
3. [Solution 1: System Preset Approach](#solution-1-system-preset-approach)
4. [Solution 2: Agents Endpoint Configuration](#solution-2-agents-endpoint-configuration-recommended)
5. [Solution 3: Role-Based Default Injection](#solution-3-role-based-default-injection)
6. [Solution 4: Interface Configuration Extension](#solution-4-interface-configuration-extension)
7. [Comparative Analysis](#comparative-analysis)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Risk Assessment](#risk-assessment)

---

## Background & Requirements

### Problem Statement
Administrators need to configure LibreChat to automatically load a specific agent for all USER role members without requiring manual selection. This should be:
- Configurable via `librechat.yaml`
- Persistent across container restarts
- Role-specific (USER role only)
- Minimal disruption to existing codebase

### Use Cases
1. **Onboarding**: New users immediately start with a pre-configured company agent
2. **Standardization**: All team members use the same default agent with standardized instructions
3. **Compliance**: Ensure specific guardrails/tools are always enabled by default
4. **Testing**: QA environments with consistent default configuration

---

## Existing Architecture Patterns

### Configuration Hierarchy
LibreChat uses a **3-tier configuration pattern**:

```
┌─────────────────────────────────────┐
│   Schema Defaults (Zod/Mongoose)    │  ← Lowest Priority
├─────────────────────────────────────┤
│   Role Defaults (roleDefaults)      │  ← Medium Priority
├─────────────────────────────────────┤
│   librechat.yaml Configuration      │  ← Highest Priority
└─────────────────────────────────────┘
```

### Key Components

#### 1. **Conversation Schema** (`packages/data-schemas/src/schema/convo.ts`)
```typescript
const convoSchema = new Schema({
  endpoint: { type: String, required: true },
  agent_id: { type: String },
  // ... inherits all conversationPreset fields
});
```

#### 2. **Configuration Loading** (`api/server/services/Config/loadCustomConfig.js`)
- Parses `librechat.yaml` with Zod validation
- Loads endpoint configurations
- Validates against strict schemas

#### 3. **Endpoint Defaults** (`packages/data-schemas/src/app/endpoints.ts`)
- Each endpoint can define `models.default`
- Agents endpoint loaded via `loadEndpoints()`

#### 4. **Role System** (`packages/data-schemas/src/methods/role.ts`)
- System roles: ADMIN, USER
- Permission-based access control
- Initialized on startup with `initializeRoles()`

#### 5. **New Conversation Flow**
```
Client: /c/new → useQueryParams hook
         ↓
Backend: POST /api/agents/chat → createConversation()
         ↓
MongoDB: Save { endpoint, agent_id, ... }
```

---

## Solution 1: System Preset Approach

### Overview
Leverage the existing **Preset** system to create a system-wide default preset with the configured agent.

### Architecture

```yaml
# librechat.yaml
interface:
  presets: true

defaultPreset:
  endpoint: agents
  agent_id: "agent-uuid-here"
  title: "Company Assistant"
```

### Implementation Points

#### 1. **Configuration Schema** (`packages/data-provider/src/config.ts`)
```typescript
export const configSchema = z.object({
  // ... existing fields
  defaultPreset: z.object({
    endpoint: z.string(),
    agent_id: z.string().optional(),
    model: z.string().optional(),
    // ... other conversationPreset fields
  }).optional(),
});
```

#### 2. **Preset Model** (`packages/data-schemas/src/schema/preset.ts`)
Already has:
- `defaultPreset: Boolean` flag
- `user: String` field (null = system preset)
- All conversation preset fields

#### 3. **Preset Seeding** (`api/server/services/Config/seedDefaultPreset.js` - NEW)
```javascript
async function seedDefaultPreset(config) {
  if (!config.defaultPreset) return;

  const Preset = mongoose.models.Preset;
  await Preset.findOneAndUpdate(
    { user: null, defaultPreset: true },
    {
      $set: {
        ...config.defaultPreset,
        user: null,
        defaultPreset: true,
      }
    },
    { upsert: true }
  );
}
```

#### 4. **Client-Side Preset Loading** (`client/src/hooks/Conversations/useNewConvo.ts`)
```typescript
const { data: defaultPreset } = useQuery({
  queryKey: ['preset', 'default'],
  queryFn: () => getPresets({ defaultPreset: true }),
});

function newConversation() {
  return {
    conversationId: 'new',
    ...defaultPreset, // Apply default preset values
  };
}
```

### Files to Modify
1. `packages/data-provider/src/config.ts` - Add defaultPreset schema
2. `api/server/services/Config/loadCustomConfig.js` - Call seeding function
3. `api/server/services/Config/seedDefaultPreset.js` - NEW file
4. `client/src/hooks/Conversations/useNewConvo.ts` - Apply default preset

### Pros
- ✅ Uses existing preset infrastructure
- ✅ UI already displays presets
- ✅ Users can override via preset selection
- ✅ Familiar pattern for admins

### Cons
- ❌ Presets are user-facing, adds UI complexity
- ❌ Doesn't enforce default (users can ignore preset)
- ❌ Not truly role-specific (applies to all users)
- ❌ Preset system designed for user customization, not enforcement

### Code Complexity
**Low-Medium** (3 file modifications, 1 new file, ~100 lines)

---

## Solution 2: Agents Endpoint Configuration (RECOMMENDED)

### Overview
Extend the existing agents endpoint configuration to support a `defaultAgent` field, mirroring how other endpoints handle `models.default`.

### Architecture

```yaml
# librechat.yaml
endpoints:
  agents:
    enabled: true
    defaultAgent: "agent-uuid-here"  # NEW field
    # Optional: role-specific defaults
    roleDefaults:
      USER: "agent-uuid-here"
      ADMIN: null  # Admins get no default
```

### Implementation Points

#### 1. **Agents Endpoint Schema** (`packages/data-provider/src/config.ts`)
```typescript
export const agentsEndpointSchema = z.object({
  enabled: z.boolean().optional(),
  disableBuilder: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  defaultAgent: z.string().optional(),  // NEW
  roleDefaults: z.record(z.string()).optional(),  // NEW
});
```

#### 2. **Load Agents Defaults** (`packages/data-schemas/src/app/endpoints.ts`)
```typescript
export const loadEndpoints = (config, agentsDefaults) => {
  const agentsEndpoint = config?.endpoints?.agents;

  loadedEndpoints[EModelEndpoint.agents] = {
    ...defaultAgentsConfig,
    defaultAgent: agentsEndpoint?.defaultAgent,
    roleDefaults: agentsEndpoint?.roleDefaults,
  };

  return loadedEndpoints;
};
```

#### 3. **Default Agent Injection Middleware** (`api/server/middleware/injectDefaultAgent.js` - NEW)
```javascript
const injectDefaultAgent = async (req, res, next) => {
  const { endpoint, agent_id } = req.body;

  // Only inject if agents endpoint AND no agent specified
  if (endpoint === 'agents' && !agent_id) {
    const userRole = req.user.role;
    const agentConfig = req.app.locals.appConfig.endpoints.agents;

    const defaultAgentId =
      agentConfig?.roleDefaults?.[userRole] ??
      agentConfig?.defaultAgent;

    if (defaultAgentId) {
      req.body.agent_id = defaultAgentId;
    }
  }

  next();
};

module.exports = injectDefaultAgent;
```

#### 4. **Apply Middleware** (`api/server/routes/agents/chat.js`)
```javascript
const injectDefaultAgent = require('../../middleware/injectDefaultAgent');

router.post(
  '/agents/chat',
  injectDefaultAgent,  // NEW middleware
  requireJwtAuth,
  // ... existing handlers
);
```

#### 5. **Client-Side Default** (`client/src/hooks/Conversations/useNewConvo.ts`)
```typescript
const agentConfig = useRecoilValue(store.agentsConfig);

function newConversation() {
  const endpoint = agentConfig?.defaultAgent ? 'agents' : null;
  return {
    conversationId: 'new',
    endpoint,
    agent_id: agentConfig?.defaultAgent,
  };
}
```

### Files to Modify
1. `packages/data-provider/src/config.ts` - Extend agentsEndpointSchema
2. `packages/data-schemas/src/app/endpoints.ts` - Load defaultAgent config
3. `api/server/middleware/injectDefaultAgent.js` - NEW middleware file
4. `api/server/routes/agents/chat.js` - Apply middleware
5. `client/src/hooks/Conversations/useNewConvo.ts` - Apply client default

### Pros
- ✅ **Follows existing patterns** (mirrors `models.default`)
- ✅ **Minimal code changes** (1 new file, 4 modifications)
- ✅ **Role-specific configuration** (optional roleDefaults)
- ✅ **Clean separation of concerns** (agent config in agents section)
- ✅ **Backend enforcement** (middleware ensures compliance)
- ✅ **Non-breaking** (only affects new conversations without agent_id)

### Cons
- ❌ Requires middleware addition (minimal risk)
- ❌ New configuration field (requires documentation)

### Code Complexity
**Low** (4 file modifications, 1 new middleware, ~80 lines)

---

## Solution 3: Role-Based Default Injection

### Overview
Extend the existing **role system** to include default conversation presets per role, similar to permission defaults.

### Architecture

```yaml
# librechat.yaml
roles:
  USER:
    permissions:
      agents: true
    defaults:  # NEW section
      endpoint: agents
      agent_id: "agent-uuid-here"

  ADMIN:
    permissions:
      agents: true
    defaults:
      endpoint: null  # Admins choose their own
```

### Implementation Points

#### 1. **Role Schema Extension** (`packages/data-schemas/src/schema/role.ts`)
```typescript
const roleSchema = new Schema({
  name: { type: String, required: true, unique: true },
  permissions: { type: Map, of: Boolean, default: {} },
  defaults: {  // NEW field
    endpoint: { type: String },
    agent_id: { type: String },
    model: { type: String },
    // ... other conversationPreset fields
  },
});
```

#### 2. **Role Defaults Seeding** (`packages/data-schemas/src/methods/role.ts`)
```typescript
async function initializeRoles(config) {
  const Role = mongoose.models.Role;

  for (const roleName of [SystemRoles.ADMIN, SystemRoles.USER]) {
    const roleConfig = config.roles?.[roleName];

    await Role.findOneAndUpdate(
      { name: roleName },
      {
        $set: {
          permissions: roleConfig?.permissions ?? roleDefaults[roleName].permissions,
          defaults: roleConfig?.defaults ?? {},  // NEW
        }
      },
      { upsert: true }
    );
  }
}
```

#### 3. **Apply Role Defaults** (`api/server/middleware/applyRoleDefaults.js` - NEW)
```javascript
const applyRoleDefaults = async (req, res, next) => {
  if (!req.body.conversationId || req.body.conversationId === 'new') {
    const Role = mongoose.models.Role;
    const userRole = await Role.findOne({ name: req.user.role });

    if (userRole?.defaults) {
      // Apply defaults only if not already specified
      req.body.endpoint = req.body.endpoint ?? userRole.defaults.endpoint;
      req.body.agent_id = req.body.agent_id ?? userRole.defaults.agent_id;
      req.body.model = req.body.model ?? userRole.defaults.model;
    }
  }
  next();
};
```

#### 4. **Client Fetch Role Defaults** (`client/src/hooks/useRoleDefaults.ts` - NEW)
```typescript
export default function useRoleDefaults() {
  const { data: roleDefaults } = useQuery({
    queryKey: ['roleDefaults'],
    queryFn: () => fetch('/api/user/role-defaults').then(r => r.json()),
  });

  return roleDefaults;
}
```

#### 5. **Apply to New Conversations** (`client/src/hooks/Conversations/useNewConvo.ts`)
```typescript
const roleDefaults = useRoleDefaults();

function newConversation() {
  return {
    conversationId: 'new',
    ...roleDefaults,  // Apply role-based defaults
  };
}
```

### Files to Modify
1. `packages/data-schemas/src/schema/role.ts` - Add defaults field
2. `packages/data-schemas/src/methods/role.ts` - Seed role defaults
3. `packages/data-provider/src/config.ts` - Add roles config schema
4. `api/server/middleware/applyRoleDefaults.js` - NEW middleware
5. `api/server/routes/user.js` - NEW endpoint for role defaults
6. `client/src/hooks/useRoleDefaults.ts` - NEW hook
7. `client/src/hooks/Conversations/useNewConvo.ts` - Apply defaults

### Pros
- ✅ **Highly flexible** (different defaults per role)
- ✅ **Leverages existing role system**
- ✅ **Centralized configuration** (all role settings in one place)
- ✅ **Extensible** (can add more default fields easily)

### Cons
- ❌ **High complexity** (7 files, 2 new files)
- ❌ **Role system coupling** (mixes permissions with defaults)
- ❌ **Database migration** (Role model changes)
- ❌ **Additional API endpoint** (client needs to fetch defaults)

### Code Complexity
**High** (5 file modifications, 3 new files, ~200 lines)

---

## Solution 4: Interface Configuration Extension

### Overview
Add a `defaultConversation` section to the interface configuration, following the pattern of other interface defaults.

### Architecture

```yaml
# librechat.yaml
interface:
  endpointsMenu: true
  modelSelect: true
  agents: true

  defaultConversation:  # NEW section
    endpoint: agents
    agent_id: "agent-uuid-here"
    model: null
```

### Implementation Points

#### 1. **Interface Schema Extension** (`packages/data-provider/src/config.ts`)
```typescript
export const interfaceSchema = z.object({
  // ... existing fields
  defaultConversation: z.object({
    endpoint: z.string().optional(),
    agent_id: z.string().optional(),
    model: z.string().optional(),
    // ... other fields
  }).optional(),
});
```

#### 2. **Load Interface Defaults** (`packages/data-schemas/src/app/interface.ts`)
```typescript
export async function loadDefaultInterface({ config, configDefaults }) {
  const { interface: interfaceConfig } = config ?? {};

  return {
    // ... existing interface config
    defaultConversation: interfaceConfig?.defaultConversation,
  };
}
```

#### 3. **Expose to Client** (`api/server/controllers/AppController.js`)
```javascript
async function getConfig(req, res) {
  const appConfig = req.app.locals.appConfig;

  res.json({
    // ... existing config
    defaultConversation: appConfig.interfaceConfig?.defaultConversation,
  });
}
```

#### 4. **Apply on Client** (`client/src/hooks/Conversations/useNewConvo.ts`)
```typescript
const appConfig = useRecoilValue(store.appConfig);

function newConversation() {
  return {
    conversationId: 'new',
    ...appConfig.defaultConversation,  // Apply interface defaults
  };
}
```

### Files to Modify
1. `packages/data-provider/src/config.ts` - Add defaultConversation to interface schema
2. `packages/data-schemas/src/app/interface.ts` - Load interface defaults
3. `api/server/controllers/AppController.js` - Expose to client
4. `client/src/hooks/Conversations/useNewConvo.ts` - Apply defaults

### Pros
- ✅ **Simple implementation** (4 file modifications)
- ✅ **Follows interface pattern** (consistent with other UI defaults)
- ✅ **Client-side only** (no middleware needed)
- ✅ **Easy to understand** (clear configuration location)

### Cons
- ❌ **No backend enforcement** (client can ignore)
- ❌ **Not role-specific** (applies to all users equally)
- ❌ **Conceptual mismatch** (interface config is for UI features, not conversation defaults)
- ❌ **Weak enforcement** (easily bypassed)

### Code Complexity
**Low** (4 file modifications, ~50 lines)

---

## Comparative Analysis

### Feature Comparison Matrix

| Feature | Solution 1 (Preset) | Solution 2 (Endpoint) | Solution 3 (Role) | Solution 4 (Interface) |
|---------|--------------------|-----------------------|-------------------|------------------------|
| **Code Changes** | 4 files, 1 new | 5 files, 1 new | 7 files, 3 new | 4 files |
| **Lines of Code** | ~100 | ~80 | ~200 | ~50 |
| **Backend Enforcement** | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| **Role-Specific** | ❌ No | ✅ Yes (optional) | ✅ Yes | ❌ No |
| **Follows Patterns** | ⚠️ Partial | ✅ Yes | ⚠️ Extends | ⚠️ Partial |
| **Configuration Clarity** | ⚠️ Preset section | ✅ agents section | ⚠️ roles section | ✅ interface section |
| **User Override** | ✅ Easy | ✅ Yes | ✅ Yes | ✅ Easy |
| **Database Changes** | ❌ Yes (Preset) | ❌ No | ❌ Yes (Role) | ❌ No |
| **API Changes** | ⚠️ Minor | ❌ No | ✅ New endpoint | ❌ No |
| **Testing Complexity** | Medium | Low | High | Low |
| **Migration Required** | No | No | Yes | No |
| **Maintenance Burden** | Medium | Low | High | Low |

### Scoring Rubric (1-5, 5 = best)

| Criteria | Weight | Solution 1 | Solution 2 | Solution 3 | Solution 4 |
|----------|--------|------------|------------|------------|------------|
| **Minimal Code Changes** | 20% | 3 | 4 | 2 | 5 |
| **Follows Existing Patterns** | 20% | 3 | 5 | 3 | 3 |
| **Backend Enforcement** | 15% | 1 | 5 | 5 | 1 |
| **Role-Specific Config** | 15% | 1 | 4 | 5 | 1 |
| **Configuration Clarity** | 10% | 3 | 5 | 3 | 4 |
| **Maintainability** | 10% | 3 | 5 | 2 | 4 |
| **Testing/Debugging** | 10% | 3 | 4 | 2 | 4 |
| **TOTAL SCORE** | 100% | **2.4** | **4.5** | **3.3** | **3.0** |

### Decision Matrix

```
Complexity vs Features
│
5│                    ● Solution 3
 │                   (High features,
4│                    high complexity)
 │
3│     ● Solution 4
 │    (Low features,
2│     low complexity)  ● Solution 1
 │                     (Medium both)
1│
 │        ★ Solution 2
0│       (High features, low complexity)
 └─────────────────────────────────────
  0    1    2    3    4    5
        Implementation Complexity →

★ = RECOMMENDED
```

---

## RECOMMENDATION: Solution 2

### Why Solution 2 (Agents Endpoint Configuration)?

#### 1. **Follows Existing Architecture Patterns**
- Mirrors the `models.default` pattern used by other endpoints
- Agents configuration naturally belongs in the `endpoints.agents` section
- Consistent with how LibreChat handles endpoint-specific defaults

#### 2. **Minimal Code Changes**
- Only 5 file modifications + 1 new middleware file
- ~80 lines of code total
- No database schema changes
- No API endpoint additions

#### 3. **Backend Enforcement + Client Defaults**
- Middleware ensures defaults are applied server-side
- Client can preemptively show default agent
- Defense in depth: works even if client bypasses defaults

#### 4. **Role-Specific Flexibility (Optional)**
- Can easily add `roleDefaults` for per-role configuration
- Fallback to global `defaultAgent` if role-specific not defined
- Future-proof for multi-role scenarios

#### 5. **Non-Breaking Changes**
- Only affects new conversations without `agent_id`
- Existing conversations unaffected
- No migration required
- Backward compatible

#### 6. **Clear Configuration**
```yaml
endpoints:
  agents:
    enabled: true
    defaultAgent: "agent-uuid-here"
    # Optional advanced usage:
    roleDefaults:
      USER: "support-agent-id"
      ADMIN: null
```

Clean, intuitive, and self-documenting.

---

## Implementation Roadmap

### Phase 1: Core Implementation (1-2 days)

#### Step 1: Schema Extension
- **File**: `packages/data-provider/src/config.ts`
- **Changes**: Add `defaultAgent` and `roleDefaults` to `agentsEndpointSchema`
- **Testing**: Validate schema parses correctly

#### Step 2: Configuration Loading
- **File**: `packages/data-schemas/src/app/endpoints.ts`
- **Changes**: Load `defaultAgent` and `roleDefaults` into agents endpoint config
- **Testing**: Verify config appears in `appConfig.endpoints.agents`

#### Step 3: Backend Middleware
- **File**: `api/server/middleware/injectDefaultAgent.js` (NEW)
- **Changes**: Create middleware to inject default agent_id
- **Testing**: Unit test with various role/config combinations

#### Step 4: Apply Middleware
- **File**: `api/server/routes/agents/chat.js`
- **Changes**: Add middleware to route
- **Testing**: Integration test POST requests

#### Step 5: Client-Side Default
- **File**: `client/src/hooks/Conversations/useNewConvo.ts`
- **Changes**: Apply default agent from config
- **Testing**: E2E test new conversation creation

### Phase 2: Documentation (0.5 days)

#### Step 6: Update Configuration Docs
- Document `defaultAgent` field in librechat.yaml
- Add examples for role-specific configuration
- Update migration guide

#### Step 7: Update Example Config
- **File**: `librechat.example.yaml`
- **Changes**: Add commented example of defaultAgent

### Phase 3: Testing & Validation (1 day)

#### Step 8: Unit Tests
- Test middleware with various inputs
- Test schema validation
- Test configuration loading

#### Step 9: Integration Tests
- Test full conversation creation flow
- Test role-specific defaults
- Test fallback behavior

#### Step 10: E2E Tests
- Test UI shows default agent
- Test conversation persists agent_id
- Test user can override default

### Phase 4: Deployment (0.5 days)

#### Step 11: Code Review & PR
- Submit PR with all changes
- Address review comments
- Merge to main

#### Step 12: Release Notes
- Document new feature in changelog
- Update version number
- Deploy to production

**Total Estimated Time**: 3-4 days

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| **Middleware breaks existing requests** | Low | High | Thorough testing, feature flag, gradual rollout |
| **Agent ID not found in database** | Medium | Medium | Middleware validates agent exists before injecting |
| **Performance impact from middleware** | Low | Low | Middleware only runs on agents endpoint |
| **Configuration parsing errors** | Low | Medium | Strict Zod schema validation |
| **Role defaults override user choice** | Low | Medium | Only apply when agent_id not specified |

### Mitigation Strategies

#### 1. Feature Flag
Add environment variable to enable/disable default agent:
```bash
ENABLE_DEFAULT_AGENT=true
```

#### 2. Agent Validation
Middleware checks agent exists and user has access:
```javascript
const agent = await Agent.findById(defaultAgentId);
if (!agent || !userHasAccess(req.user, agent)) {
  return next(); // Skip default injection
}
```

#### 3. Logging
Add comprehensive logging for debugging:
```javascript
logger.info('Injecting default agent', {
  userId: req.user.id,
  role: req.user.role,
  agentId: defaultAgentId
});
```

#### 4. Backward Compatibility
Ensure existing conversations continue to work:
- Only apply defaults to `conversationId === 'new'`
- Never override explicitly set `agent_id`
- Fallback gracefully if default agent unavailable

---

## Alternative Considerations

### Why Not Solution 1 (Preset)?
- Presets are **user-facing** for customization, not enforcement
- Adds UI clutter with system-generated preset
- Users can easily ignore presets
- Conceptual mismatch with preset purpose

### Why Not Solution 3 (Role-Based)?
- **Overengineered** for the requirement
- Mixing permission configuration with conversation defaults
- Requires database migration
- High maintenance burden

### Why Not Solution 4 (Interface)?
- **No backend enforcement** (easily bypassed)
- Interface config designed for UI feature toggles
- Not role-specific
- Conceptual mismatch

---

## Conclusion

**Solution 2 (Agents Endpoint Configuration)** provides the optimal balance of:
- ✅ Minimal code changes (~80 lines, 6 files)
- ✅ Strong backend enforcement (middleware)
- ✅ Clear, intuitive configuration (follows existing patterns)
- ✅ Role-specific flexibility (optional advanced feature)
- ✅ Non-breaking changes (backward compatible)
- ✅ Low maintenance burden

The implementation follows LibreChat's existing architectural patterns (mirroring `models.default`), requires no database migrations, and provides both client-side convenience and server-side enforcement.

**Estimated Development Time**: 3-4 days
**Risk Level**: Low
**Maintenance Burden**: Low

---

## Appendix: Configuration Examples

### Basic Configuration
```yaml
# librechat.yaml
endpoints:
  agents:
    enabled: true
    defaultAgent: "550e8400-e29b-41d4-a716-446655440000"
```

### Advanced Role-Specific Configuration
```yaml
# librechat.yaml
endpoints:
  agents:
    enabled: true
    defaultAgent: "550e8400-e29b-41d4-a716-446655440000"  # Fallback
    roleDefaults:
      USER: "550e8400-e29b-41d4-a716-446655440000"  # Support agent
      ADMIN: null  # No default for admins
```

### With Additional Endpoint Configuration
```yaml
# librechat.yaml
endpoints:
  agents:
    enabled: true
    disableBuilder: false
    defaultAgent: "550e8400-e29b-41d4-a716-446655440000"
    capabilities:
      - code_interpreter
      - file_search
      - web_search
```

---

## References

- **Conversation Schema**: `packages/data-schemas/src/schema/convo.ts`
- **Endpoint Loading**: `packages/data-schemas/src/app/endpoints.ts`
- **Configuration Schema**: `packages/data-provider/src/config.ts`
- **Role System**: `packages/data-schemas/src/methods/role.ts`
- **New Conversation Hook**: `client/src/hooks/Conversations/useNewConvo.ts`
- **Agents Chat Route**: `api/server/routes/agents/chat.js`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Author**: Software Architecture Analysis
**Status**: Recommendation for Implementation
