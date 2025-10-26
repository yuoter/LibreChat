# Default Agent Configuration - Architectural Analysis

## Executive Summary

Implementing a default agent configuration in LibreChat that:
1. Automatically sets the endpoint to "agents" for all users with USER role
2. Pre-selects a specific agent (by agent_id) defined in librechat.yaml
3. Makes this configuration persistent and enforced by Docker Compose
4. Minimizes changes to the existing codebase

Default agent id will be set in librechat.yaml

**Recommended Solution**: **Solution  - Agents Endpoint Configuration Extension** (See detailes below)

---

## Table of Contents

1. [Background & Requirements](#background--requirements)
2. [Existing Architecture Patterns](#existing-architecture-patterns)
3. [Solution: Agents Endpoint Configuration](#solution-agents-endpoint-configuration)


---

## Background & Requirements

### Problem Statement
Administrators need to configure LibreChat to automatically load a specific agent for all USER role members without requiring manual selection. This should be:
- Configurable via `librechat.yaml`
- Persistent across container restarts
- Role-specific (USER role only)
- Minimal disruption to existing codebase

### Use Cases
1. **Onboarding**: New users immediately start with a pre-configured agent
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


## Solution: Agents Endpoint Configuration

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




