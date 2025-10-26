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
    defaultAgent: "agent-uuid-here"  # NEW field - applies ONLY to USER role
```

**Important**: The `defaultAgent` is applied **only to users with USER role**. Users with ADMIN role never get a default agent assigned automatically.

### Implementation Points

#### 1. **Agents Endpoint Schema** (`packages/data-provider/src/config.ts`)
```typescript
export const agentsEndpointSchema = z.object({
  enabled: z.boolean().optional(),
  disableBuilder: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  defaultAgent: z.string().min(1).optional(),  // NEW - applies only to USER role, validate non-empty
});
```

#### 2. **Load Agents Defaults** (`packages/data-schemas/src/app/endpoints.ts`)
```typescript
export const loadEndpoints = (config, agentsDefaults) => {
  const agentsEndpoint = config?.endpoints?.agents;

  loadedEndpoints[EModelEndpoint.agents] = {
    ...defaultAgentsConfig,
    defaultAgent: agentsEndpoint?.defaultAgent,
  };

  return loadedEndpoints;
};
```

#### 3. **Default Agent Injection Middleware** (`api/server/middleware/injectDefaultAgent.js` - NEW)
```javascript
const { logger } = require('@librechat/data-schemas');
const { getAgent } = require('~/models/Agent');

const injectDefaultAgent = async (req, res, next) => {
  try {
    const { endpoint, agent_id } = req.body;

    // Only inject if agents endpoint AND no agent specified
    if (endpoint === 'agents' && !agent_id) {
      // CRITICAL: Validate authentication data exists
      // This middleware runs AFTER requireJwtAuth, so req.user MUST be present
      // If not, something went wrong and we must reject the request
      if (!req.user || !req.user.role) {
        logger.error('[injectDefaultAgent] Authentication data missing - req.user or req.user.role is undefined');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const userRole = req.user.role;

      // CRITICAL: Only apply default agent to USER role, never to ADMIN
      if (userRole !== 'USER') {
        return next();
      }

      // Safe to use optional chaining for config objects that may not be configured
      const agentConfig = req.app.locals.appConfig?.endpoints?.agents;
      if (!agentConfig?.enabled || !agentConfig?.defaultAgent) {
        return next();
      }

      const defaultAgentId = agentConfig.defaultAgent;

      // Validate agent exists before injecting
      const agentExists = await getAgent({ id: defaultAgentId });
      if (agentExists) {
        req.body.agent_id = defaultAgentId;
        logger.debug(`[injectDefaultAgent] Injected default agent ${defaultAgentId} for user ${req.user.id}`);
      } else {
        logger.warn(`[injectDefaultAgent] Default agent ${defaultAgentId} not found in database`);
      }
    }

    next();
  } catch (error) {
    logger.error('[injectDefaultAgent] Error in middleware:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process agent configuration',
    });
  }
};

module.exports = injectDefaultAgent;
```

#### 4. **Apply Middleware** (`api/server/routes/agents/chat.js`)
```javascript
const injectDefaultAgent = require('../../middleware/injectDefaultAgent');

router.post(
  '/agents/chat',
  requireJwtAuth,      // MUST run first to populate req.user
  injectDefaultAgent,  // NEW middleware - runs AFTER authentication
  // ... existing handlers
);
```

#### 5. **Client-Side Default** (`client/src/hooks/Conversations/useNewConvo.ts`)
```typescript
const agentConfig = useRecoilValue(store.agentsConfig);
const user = useRecoilValue(store.user);

function newConversation() {
  // Early return if not authenticated or role not available
  if (!user || !user.role) {
    return {
      conversationId: 'new',
      endpoint: null,
      agent_id: null,
    };
  }

  const userRole = user.role;

  // CRITICAL: Only apply default agent to USER role, never to ADMIN
  const shouldUseDefaultAgent =
    userRole === 'USER' &&
    agentConfig?.enabled &&
    agentConfig?.defaultAgent;

  if (!shouldUseDefaultAgent) {
    return {
      conversationId: 'new',
      endpoint: null,
      agent_id: null,
    };
  }

  return {
    conversationId: 'new',
    endpoint: 'agents',
    agent_id: agentConfig.defaultAgent,
  };
}
```

#### 6. **Configuration Propagation to Client** (`api/server/services/Config/client.js`)
```javascript
// Ensure agents config is included in client config response
function getClientConfig() {
  const config = req.app.locals.appConfig;

  return {
    // ... existing config
    endpoints: {
      // ... other endpoints
      agents: {
        enabled: config.endpoints?.agents?.enabled,
        disableBuilder: config.endpoints?.agents?.disableBuilder,
        defaultAgent: config.endpoints?.agents?.defaultAgent,
      },
    },
  };
}
```

**Note**: The exact implementation depends on how LibreChat currently serves configuration to the client. This config must be:
- Included in the initial app bootstrap/config endpoint
- Stored in Recoil state as `store.agentsConfig`
- Available before the user creates their first conversation

### Critical Implementation Requirements

⚠️ **IMPORTANT**: The following points are critical for correct implementation:

1. **USER Role Only** - The default agent MUST be applied **only to users with role 'USER'**. ADMIN users and any other roles should never receive a default agent. Both client and server must check `userRole === 'USER'` explicitly.

2. **Middleware Ordering** - The `injectDefaultAgent` middleware MUST run AFTER `requireJwtAuth` because it requires `req.user` to be populated. Placing it before authentication will cause runtime errors.

3. **Agent Validation** - Always validate that the configured `defaultAgent` ID exists in the database before injecting it. Invalid IDs should log warnings but not break the request flow.

4. **Client Configuration** - The agents configuration (including `defaultAgent`) must be propagated to the client via the config API endpoint and stored in Recoil state before use.

5. **Authentication Validation and Null Safety** -
   - **CRITICAL**: Authentication data (`req.user`, `req.user.role`) MUST be validated and present. If missing, return 401 error immediately. Never use optional chaining for authentication data in server-side middleware.
   - Use optional chaining ONLY for configuration objects (`agentConfig`, `endpoints`) that may legitimately not be configured.
   - **Security Principle**: Fail securely - missing authentication data is an error condition that must reject the request, not a valid state to silently handle.
   - Client-side code should check for authentication before proceeding with logic

6. **Consistent Role Check** - Both client and server must use the same role check logic: `userRole === 'USER'`. No other roles should receive the default agent.

### Files to Modify
1. `packages/data-provider/src/config.ts` - Extend agentsEndpointSchema with `defaultAgent` field
2. `packages/data-schemas/src/app/endpoints.ts` - Load defaultAgent config
3. `api/server/middleware/injectDefaultAgent.js` - NEW middleware file (USER role check + validation)
4. `api/server/routes/agents/chat.js` - Apply middleware (AFTER requireJwtAuth)
5. `client/src/hooks/Conversations/useNewConvo.ts` - Apply client default (USER role only)
6. `api/server/services/Config/client.js` - Include agents config in client response




