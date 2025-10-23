# Default Agents Implementation Plan

## Overview

This document outlines the implementation plan for adding default agents and actions functionality to LibreChat. This feature will allow administrators to define agents and their actions in `librechat.yaml` that are automatically available to all users, with the UI restricted to only show these default agents.

## Table of Contents

1. [Goals and Requirements](#goals-and-requirements)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Phases](#implementation-phases)
4. [Database Schema Considerations](#database-schema-considerations)
5. [Configuration Structure](#configuration-structure)
6. [Implementation Details](#implementation-details)
7. [Testing Plan](#testing-plan)
8. [Rollout Strategy](#rollout-strategy)

---

## Goals and Requirements

### Primary Goals

1. **Default Agents Configuration**: Define default agents and their actions in `librechat.yaml`
2. **Universal Availability**: Make default agents available to all users automatically
3. **UI Restriction**: Show ONLY default agents in model select, hide all other options
4. **Auto-Synchronization**: Automatically update database when `librechat.yaml` changes and container restarts
5. **Schema Preservation**: Reuse existing agent/action schemas without modifications
6. **File-Based Configuration**: Support file references for specs, instructions, and icons
7. **Debug Logging**: Comprehensive logging at every step for troubleshooting
8. **Token Tracking**: Ensure token/credit tracking continues to work (verify existing implementation)
9. **Agent Builder Toggle**: Add configuration to hide Agent Builder panel

### Non-Goals

- No new UI components
- No modification to existing database schemas
- No changes to existing agent execution logic
- No breaking changes to current functionality

---

## Architecture Overview

### Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     librechat.yaml                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ endpoints:                                            │ │
│  │   agents:                                             │ │
│  │     disableBuilder: true                              │ │
│  │     defaultAgents:                                    │ │
│  │       - id: "customer-support"                        │ │
│  │         name: "Customer Support"                      │ │
│  │         instructionsFile: "./agents/support.txt"      │ │
│  │         iconFile: "./agents/icons/support.png"        │ │
│  │         provider: "openai"                            │ │
│  │         model: "gpt-4o"                               │ │
│  │         actions:                                      │ │
│  │           - domain: "api.example.com"                 │ │
│  │             specFile: "./actions/example-spec.yaml"   │ │
│  │             auth: {...}                               │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Configuration Loader (Server Start)            │
│  - Parse librechat.yaml                                     │
│  - Load file-based content (specs, instructions, icons)     │
│  - Validate configuration                                   │
│  - Log configuration details                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Default Agents Synchronization Service             │
│  - Create/update agents with DEFAULT_OBJECT_ID     │
│  - Create/update actions with DEFAULT_OBJECT_ID    │
│  - Handle file uploads (icons)                             │
│  - Version control (hash-based change detection)           │
│  - Cleanup removed default agents/actions                  │
│  - Detailed debug logging                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      MongoDB Database                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Agent Collection                                      │ │
│  │  - author: DEFAULT_OBJECT_ID (for defaults)   │ │
│  │  - Normal agent fields                                │ │
│  │  - versions array for change tracking                 │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Action Collection                                     │ │
│  │  - user: DEFAULT_OBJECT_ID (for defaults)     │ │
│  │  - Normal action fields                               │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer Modifications                  │
│  - GET /agents - Filter to show only default agents        │
│  - GET /endpoints/config - Include defaultAgentsOnly flag  │
│  - Agent access middleware - Allow default agent access    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   UI Modifications                          │
│  - ModelSelect: Show only default agents when configured   │
│  - Hide custom endpoints option                            │
│  - Hide assistants option                                  │
│  - Hide agent builder when disableBuilder: true            │
│  - Show only agent selection dropdown                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Configuration and Environment Setup

**Objective**: Set up configuration structure and environment variables

**Tasks**:

1. Add `DEFAULT_OBJECT_ID` to `.env.example`
   - Default value: `000000000000000000000000`
   - Documentation comment explaining its purpose

2. Create configuration schema in `packages/data-schemas/src/app/agents.ts`
   - Add `defaultAgents` array type definition
   - Add validation for default agent configuration
   - Add file reference types (instructionsFile, iconFile)
   - Add action configuration with specFile support

3. Update `librechat.example.yaml`
   - Add example default agents configuration
   - Add example default actions configuration
   - Document all available options
   - Show file-based configuration examples

**Files to Modify**:
- `.env.example`
- `packages/data-schemas/src/app/agents.ts`
- `packages/data-schemas/src/types/config.ts`
- `librechat.example.yaml`

**Acceptance Criteria**:
- Environment variable documented
- Configuration schema validates correctly
- Example configuration is comprehensive

---

### Phase 2: File Loading Utilities

**Objective**: Create utilities to load file-based configurations

**Tasks**:

1. Create `api/server/utils/files/loadConfigFile.js`
   ```javascript
   /**
    * Loads a file from the file system relative to config directory
    * @param {string} filePath - Relative or absolute file path
    * @param {string} fileType - Type of file (text, yaml, json, binary)
    * @returns {Promise<string|Buffer>} File contents
    */
   async function loadConfigFile(filePath, fileType) {
     // Implementation
   }
   ```

2. Create `api/server/utils/files/processIconFile.js`
   ```javascript
   /**
    * Processes icon file and uploads to configured storage
    * @param {string} filePath - Path to icon file
    * @param {string} agentId - Agent ID for naming
    * @returns {Promise<{filepath: string, source: string}>} Avatar object
    */
   async function processIconFile(filePath, agentId) {
     // Implementation
   }
   ```

3. Add file validation utilities
   - YAML/JSON spec validation
   - Image file validation (format, size)
   - Path traversal prevention
   - Error handling with detailed logging

**Files to Create**:
- `api/server/utils/files/loadConfigFile.js`
- `api/server/utils/files/processIconFile.js`
- `api/server/utils/files/validateConfigFile.js`

**Acceptance Criteria**:
- Files can be loaded from relative and absolute paths
- Icons are uploaded to configured storage
- Security validations prevent path traversal
- Detailed error logging for troubleshooting

---

### Phase 3: Default Agents Synchronization Service

**Objective**: Create service to sync default agents from config to database

**Tasks**:

1. Create `api/server/services/DefaultAgents/sync.js`
   ```javascript
   /**
    * Synchronizes default agents from librechat.yaml to database
    * @param {Object} config - Parsed configuration
    * @returns {Promise<void>}
    */
   async function syncDefaultAgents(config) {
     const logger = createLogger('DefaultAgentsSync');

     // 1. Extract default agents configuration
     logger.debug('Extracting default agents configuration');

     // 2. Load file-based content
     logger.debug('Loading file-based configurations');

     // 3. Create/update agents
     logger.debug('Synchronizing agents to database');

     // 4. Create/update actions
     logger.debug('Synchronizing actions to database');

     // 5. Cleanup removed agents/actions
     logger.debug('Cleaning up removed default agents');
   }
   ```

2. Implement agent synchronization logic
   - Query for existing default agents (author = DEFAULT_OBJECT_ID)
   - Compare configurations using hash
   - Create new agents if not exists
   - Update agents if hash differs
   - Use version control for updates
   - Upload icons to storage

3. Implement action synchronization logic
   - Query for existing default actions (user = DEFAULT_OBJECT_ID)
   - Load spec files
   - Create/update actions
   - Associate with agents

4. Implement cleanup logic
   - Identify agents removed from config
   - Mark as deleted or remove from database
   - Clean up associated actions
   - Clean up uploaded files

5. Add comprehensive logging
   - Log each step with context
   - Log file operations
   - Log database operations
   - Log errors with stack traces
   - Use structured logging

**Files to Create**:
- `api/server/services/DefaultAgents/sync.js`
- `api/server/services/DefaultAgents/logger.js`
- `api/server/services/DefaultAgents/hashUtils.js`
- `api/server/services/DefaultAgents/index.js`

**Acceptance Criteria**:
- Agents are created with DEFAULT_OBJECT_ID as author
- Actions are created with DEFAULT_OBJECT_ID as user
- Updates are idempotent (running multiple times produces same result)
- Removed agents/actions are cleaned up
- All operations are logged in detail

---

### Phase 4: Server Startup Integration

**Objective**: Integrate synchronization service into server startup

**Tasks**:

1. Modify `api/server/index.js`
   - Import synchronization service
   - Run sync after database connection established
   - Run sync before server starts listening
   - Add error handling
   - Log sync status

2. Add sync timing logging
   - Log sync start time
   - Log sync completion time
   - Log sync duration
   - Log number of agents/actions synced

3. Handle sync failures gracefully
   - Log detailed error information
   - Decide on failure behavior (continue or abort)
   - Implement retry logic if appropriate

**Files to Modify**:
- `api/server/index.js`

**Acceptance Criteria**:
- Sync runs on every server start
- Sync completes before server accepts requests
- Failures are logged but don't crash server (configurable)
- Sync duration is reasonable (<10 seconds for typical configs)

---

### Phase 5: API Layer Modifications

**Objective**: Modify API endpoints to support default agents filtering

**Tasks**:

1. Modify `api/server/routes/agents/agents.js`
   - Add query parameter for default-only agents
   - Filter agents by author = DEFAULT_OBJECT_ID when required
   - Ensure default agents are always included in results

2. Create middleware `api/server/middleware/checkDefaultAgentAccess.js`
   ```javascript
   /**
    * Allows access to default agents for all users
    * @param {Object} req - Express request
    * @param {Object} res - Express response
    * @param {Function} next - Next middleware
    */
   async function checkDefaultAgentAccess(req, res, next) {
     // Check if agent is default (author = DEFAULT_OBJECT_ID)
     // If yes, allow access regardless of permissions
     // If no, proceed with normal permission checks
   }
   ```

3. Modify `api/server/controllers/agents/v1.js`
   - Include default agents in list operations
   - Allow all users to access default agents
   - Prevent modification of default agents by users

4. Update `api/server/services/Config/loadCustomConfig.js`
   - Add `defaultAgentsOnly` flag to config
   - Set based on presence of defaultAgents in librechat.yaml
   - Include in endpoints configuration response

5. Modify `api/server/routes/endpoints.js`
   - Include `defaultAgentsOnly` in /endpoints/config response
   - Include `disableBuilder` flag

**Files to Modify**:
- `api/server/routes/agents/agents.js`
- `api/server/middleware/checkDefaultAgentAccess.js` (create)
- `api/server/controllers/agents/v1.js`
- `api/server/services/Config/loadCustomConfig.js`
- `api/server/routes/endpoints.js`

**Acceptance Criteria**:
- Default agents are accessible to all users
- Users cannot edit or delete default agents
- API returns correct filtering based on configuration
- Frontend receives `defaultAgentsOnly` flag

---

### Phase 6: Frontend UI Modifications

**Objective**: Modify UI to show only default agents when configured

**Tasks**:

1. Modify `client/src/components/SidePanel/Agents/AgentSelect.tsx`
   - Check `defaultAgentsOnly` config flag
   - Filter to show only default agents
   - Hide "Create New Agent" option when defaultAgentsOnly = true

2. Modify `client/src/components/Nav/NavLinks.tsx`
   - Check `disableBuilder` config flag
   - Hide "Agent Builder" navigation item when disabled

3. Modify `client/src/components/Chat/Menus/Models/ModelSelect.tsx`
   - Check `defaultAgentsOnly` config flag
   - Hide custom endpoints option
   - Hide assistants option
   - Hide "New Conversation" endpoint switcher
   - Show only agent selection when defaultAgentsOnly = true

4. Modify `client/src/components/Chat/Menus/Endpoints/MenuSeparator.tsx`
   - Hide separator when defaultAgentsOnly = true

5. Modify `client/src/components/SidePanel/Agents/AgentPanel.tsx`
   - Disable editing for default agents
   - Show read-only view for default agents
   - Hide delete button for default agents

6. Update `client/src/hooks/Agents/useGetAgentsConfig.ts`
   - Include `defaultAgentsOnly` flag
   - Include `disableBuilder` flag
   - Make available to components

**Files to Modify**:
- `client/src/components/SidePanel/Agents/AgentSelect.tsx`
- `client/src/components/Nav/NavLinks.tsx`
- `client/src/components/Chat/Menus/Models/ModelSelect.tsx`
- `client/src/components/Chat/Menus/Endpoints/MenuSeparator.tsx`
- `client/src/components/SidePanel/Agents/AgentPanel.tsx`
- `client/src/hooks/Agents/useGetAgentsConfig.ts`

**Acceptance Criteria**:
- Only default agents are visible when configured
- Agent Builder is hidden when disabled
- Custom endpoints and assistants are hidden
- UI is clean and uncluttered
- No new UI components added

---

### Phase 7: Token Tracking Verification

**Objective**: Verify that token tracking works for default agents

**Tasks**:

1. Review existing token tracking implementation
   - Review `api/models/spendTokens.js`
   - Review `api/models/Transaction.js`
   - Verify transactions are created for agent actions
   - Verify balance updates work correctly

2. Test token tracking with default agents
   - Create test default agent with actions
   - Execute agent actions
   - Verify transactions are created
   - Verify user balance is updated
   - Verify token counts are accurate

3. Add debug logging to token tracking (if not present)
   - Log transaction creation
   - Log balance updates
   - Log token calculations

4. Document token tracking flow
   - Document how tokens are tracked for agents
   - Document how actions contribute to token usage
   - Document any special considerations

**Files to Review**:
- `api/models/spendTokens.js`
- `api/models/Transaction.js`
- `api/server/controllers/agents/request.js`

**Acceptance Criteria**:
- Token tracking works correctly for default agents
- Transactions are created for all agent operations
- User balance is updated accurately
- Documentation is complete

---

### Phase 8: Debug Logging Implementation

**Objective**: Add comprehensive debug logging throughout the system

**Tasks**:

1. Create logging utility `api/server/utils/logger.js`
   ```javascript
   /**
    * Creates a logger instance with context
    * @param {string} context - Logger context (e.g., 'DefaultAgentsSync')
    * @returns {Object} Logger instance
    */
   function createLogger(context) {
     return {
       debug: (message, data) => { /* implementation */ },
       info: (message, data) => { /* implementation */ },
       warn: (message, data) => { /* implementation */ },
       error: (message, error, data) => { /* implementation */ }
     };
   }
   ```

2. Add logging to synchronization service
   - Log configuration loading
   - Log file operations
   - Log database queries
   - Log agent/action creation/updates
   - Log cleanup operations
   - Log errors with full context

3. Add logging to API endpoints
   - Log agent access attempts
   - Log permission checks
   - Log filtering operations

4. Add logging to middleware
   - Log default agent access checks
   - Log permission bypasses

5. Configure log levels
   - Use DEBUG_LOGGING environment variable
   - Support different log levels per component
   - Include timestamps and context

**Files to Create/Modify**:
- `api/server/utils/logger.js` (create)
- `api/server/services/DefaultAgents/sync.js` (modify)
- `api/server/routes/agents/agents.js` (modify)
- `api/server/middleware/checkDefaultAgentAccess.js` (modify)

**Acceptance Criteria**:
- All operations are logged with context
- Errors include stack traces
- Log levels are configurable
- Logs are structured and parseable

---

### Phase 9: Configuration Examples and Documentation

**Objective**: Provide comprehensive examples and documentation

**Tasks**:

1. Update `librechat.example.yaml`
   ```yaml
   endpoints:
     agents:
       # Disable the builder interface for agents
       disableBuilder: true

       # (optional) Default recursion depth for agents
       recursionLimit: 50

       # Define default agents available to all users
       defaultAgents:
         # Customer Support Agent
         - id: "customer-support"
           name: "Customer Support Agent"
           description: "Helps with customer inquiries and support tickets"

           # File-based instructions (relative to config directory)
           instructionsFile: "./agents/customer-support/instructions.txt"
           # Or inline instructions
           # instructions: "You are a helpful customer support agent..."

           # Icon file (relative to config directory)
           iconFile: "./agents/customer-support/icon.png"

           # Provider and model
           provider: "openai"
           model: "gpt-4o"

           # Model parameters
           model_parameters:
             temperature: 0.7
             max_tokens: 2000

           # Tools
           tools:
             - "web_search"
             - "code_interpreter"

           # Actions
           actions:
             - domain: "api.example.com"
               # File-based OpenAPI spec
               specFile: "./actions/customer-support/openapi.yaml"
               # Or inline spec
               # spec: |
               #   openapi: 3.0.0
               #   ...

               # Authentication
               auth:
                 type: "service_http"
                 api_key: "${CUSTOMER_SUPPORT_API_KEY}"

               # Privacy policy
               privacy_policy_url: "https://example.com/privacy"

         # Sales Agent
         - id: "sales-agent"
           name: "Sales Agent"
           description: "Assists with sales inquiries and product information"
           instructionsFile: "./agents/sales/instructions.txt"
           iconFile: "./agents/sales/icon.png"
           provider: "anthropic"
           model: "claude-sonnet-4"
           actions:
             - domain: "crm.example.com"
               specFile: "./actions/sales/crm-api.yaml"
               auth:
                 type: "oauth"
                 client_url: "https://crm.example.com/oauth/authorize"
                 authorization_url: "https://crm.example.com/oauth/token"
                 scope: "read:contacts write:opportunities"
                 oauth_client_id: "${SALES_CRM_CLIENT_ID}"
                 oauth_client_secret: "${SALES_CRM_CLIENT_SECRET}"
   ```

2. Update `.env.example`
   ```bash
   #======================#
   # Default Agents       #
   #======================#

   # Object ID used to identify default agents and actions in the database
   # This should be a MongoDB ObjectId format that will never be generated naturally
   # Default: 000000000000000000000000
   DEFAULT_OBJECT_ID=000000000000000000000000

   # API keys for default agent actions
   CUSTOMER_SUPPORT_API_KEY=your-api-key-here
   SALES_CRM_CLIENT_ID=your-client-id
   SALES_CRM_CLIENT_SECRET=your-client-secret
   ```

3. Create example configuration files directory structure
   ```
   agents/
   ├── customer-support/
   │   ├── instructions.txt
   │   └── icon.png
   └── sales/
       ├── instructions.txt
       └── icon.png

   actions/
   ├── customer-support/
   │   └── openapi.yaml
   └── sales/
       └── crm-api.yaml
   ```

4. Create example files with realistic content
   - Example instructions files
   - Example OpenAPI specs
   - Example icon files

5. Document configuration in README or docs
   - Configuration structure
   - File path resolution
   - Environment variables
   - Troubleshooting guide

**Files to Modify/Create**:
- `librechat.example.yaml`
- `.env.example`
- `docs/features/default-agents.md` (create)
- Example configuration files (create)

**Acceptance Criteria**:
- Examples are comprehensive and realistic
- Documentation is clear and complete
- Directory structure is well-organized
- Environment variables are documented

---

## Database Schema Considerations

### No Schema Changes Required

The existing schemas already support the default agents functionality:

**Agent Schema** (`packages/data-schemas/src/schema/agent.ts`):
- `author` field: Will be set to `DEFAULT_OBJECT_ID` for default agents
- All other fields remain the same
- Existing version control mechanism can track updates

**Action Schema** (`packages/data-schemas/src/schema/action.ts`):
- `user` field: Will be set to `DEFAULT_OBJECT_ID` for default actions
- All other fields remain the same

### Query Patterns

**Find Default Agents**:
```javascript
const defaultObjectId = process.env.DEFAULT_OBJECT_ID || '000000000000000000000000';
const defaultAgents = await Agent.find({ author: defaultObjectId });
```

**Find All Agents for User (including defaults)**:
```javascript
const defaultObjectId = process.env.DEFAULT_OBJECT_ID || '000000000000000000000000';
const agents = await Agent.find({
  $or: [
    { author: userId },
    { author: defaultObjectId }
  ]
});
```

**Check if Agent is Default**:
```javascript
const defaultObjectId = process.env.DEFAULT_OBJECT_ID || '000000000000000000000000';
const isDefaultAgent = agent.author.toString() === defaultObjectId;
```

---

## Configuration Structure

### librechat.yaml Schema

```typescript
interface AgentsEndpointConfig {
  // Existing fields
  recursionLimit?: number;
  maxRecursionLimit?: number;
  disableBuilder?: boolean;
  capabilities?: string[];

  // New field for default agents
  defaultAgents?: DefaultAgentConfig[];
}

interface DefaultAgentConfig {
  // Required fields
  id: string;                          // Unique identifier
  name: string;                        // Display name
  provider: string;                    // Provider (openai, anthropic, etc.)
  model: string;                       // Model name

  // Optional fields
  description?: string;                // Agent description
  instructions?: string;               // Inline instructions
  instructionsFile?: string;           // File path to instructions
  icon?: string;                       // Inline icon data URL
  iconFile?: string;                   // File path to icon
  category?: string;                   // Agent category

  // Model configuration
  model_parameters?: Record<string, unknown>;
  recursion_limit?: number;

  // Capabilities
  tools?: string[];                    // Built-in tools
  actions?: DefaultActionConfig[];     // Custom actions

  // Tool resources
  tool_resources?: {
    file_search?: {
      vector_store_ids?: string[];
    };
    code_interpreter?: {
      file_ids?: string[];
    };
  };
}

interface DefaultActionConfig {
  // Required fields
  domain: string;                      // Action domain

  // OpenAPI spec
  spec?: string;                       // Inline spec (YAML or JSON string)
  specFile?: string;                   // File path to spec

  // Authentication
  auth?: {
    type: 'service_http' | 'oauth' | 'none';
    api_key?: string;
    custom_auth_header?: string;

    // OAuth fields
    client_url?: string;
    authorization_url?: string;
    scope?: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
    token_exchange_method?: 'default_post' | 'basic_auth_header';
  };

  // Optional fields
  privacy_policy_url?: string;
}
```

### Environment Variables

```bash
# Default agents object ID
DEFAULT_OBJECT_ID=000000000000000000000000

# Action API keys (referenced in librechat.yaml)
CUSTOMER_SUPPORT_API_KEY=xxx
SALES_CRM_CLIENT_ID=xxx
SALES_CRM_CLIENT_SECRET=xxx
```

---

## Implementation Details

### Phase-by-Phase Breakdown

#### Phase 1: Configuration Setup (2-3 hours)

1. **Update `.env.example`**
   - Add DEFAULT_OBJECT_ID with default value
   - Add documentation comments
   - Add example action API keys

2. **Update Configuration Schema**
   - Extend `AgentsEndpointConfig` type
   - Add validation for default agents
   - Add file reference validation

3. **Update `librechat.example.yaml`**
   - Add comprehensive example configuration
   - Document all available options
   - Show both inline and file-based configurations

#### Phase 2: File Loading (3-4 hours)

1. **Create File Loading Utilities**
   - Implement `loadConfigFile()` for text/YAML/JSON
   - Implement path resolution (relative to config directory)
   - Add path traversal prevention
   - Add error handling and logging

2. **Create Icon Processing**
   - Implement `processIconFile()` for image uploads
   - Support multiple storage backends (local, S3, Firebase)
   - Validate image formats and sizes
   - Generate unique filenames

3. **Add Validation**
   - Validate OpenAPI specs
   - Validate image files
   - Validate instruction files
   - Provide clear error messages

#### Phase 3: Synchronization Service (6-8 hours)

1. **Create Sync Service Structure**
   - Main sync function
   - Agent sync logic
   - Action sync logic
   - Cleanup logic
   - Hash-based change detection

2. **Implement Agent Synchronization**
   ```javascript
   async function syncAgent(agentConfig) {
     const logger = createLogger('AgentSync');
     const defaultObjectId = process.env.DEFAULT_OBJECT_ID;

     logger.debug(`Syncing agent: ${agentConfig.id}`);

     // Load file-based content
     let instructions = agentConfig.instructions;
     if (agentConfig.instructionsFile) {
       logger.debug(`Loading instructions from: ${agentConfig.instructionsFile}`);
       instructions = await loadConfigFile(agentConfig.instructionsFile, 'text');
     }

     let avatar = null;
     if (agentConfig.iconFile) {
       logger.debug(`Processing icon: ${agentConfig.iconFile}`);
       avatar = await processIconFile(agentConfig.iconFile, agentConfig.id);
     }

     // Calculate hash for change detection
     const configHash = calculateHash({
       ...agentConfig,
       instructions,
       avatar
     });

     // Check if agent exists
     const existingAgent = await Agent.findOne({
       id: agentConfig.id,
       author: defaultObjectId
     });

     if (existingAgent) {
       // Check if update needed
       const lastVersion = existingAgent.versions[existingAgent.versions.length - 1];
       if (lastVersion && lastVersion.configHash === configHash) {
         logger.debug(`Agent ${agentConfig.id} is up to date`);
         return existingAgent;
       }

       logger.info(`Updating agent: ${agentConfig.id}`);
       return await updateAgentWithVersion(existingAgent, agentConfig, instructions, avatar);
     } else {
       logger.info(`Creating new agent: ${agentConfig.id}`);
       return await createDefaultAgent(agentConfig, instructions, avatar);
     }
   }
   ```

3. **Implement Action Synchronization**
   ```javascript
   async function syncActions(agentId, actionsConfig) {
     const logger = createLogger('ActionSync');
     const defaultObjectId = process.env.DEFAULT_OBJECT_ID;

     for (const actionConfig of actionsConfig) {
       logger.debug(`Syncing action for agent ${agentId}: ${actionConfig.domain}`);

       // Load spec file
       let spec = actionConfig.spec;
       if (actionConfig.specFile) {
         logger.debug(`Loading spec from: ${actionConfig.specFile}`);
         spec = await loadConfigFile(actionConfig.specFile, 'yaml');
       }

       // Create action ID
       const actionId = `${actionConfig.domain}_${agentId}`;

       // Check if action exists
       const existingAction = await Action.findOne({
         action_id: actionId,
         user: defaultObjectId
       });

       const actionData = {
         action_id: actionId,
         user: defaultObjectId,
         agent_id: agentId,
         metadata: {
           domain: actionConfig.domain,
           raw_spec: spec,
           privacy_policy_url: actionConfig.privacy_policy_url,
           ...actionConfig.auth
         }
       };

       if (existingAction) {
         logger.info(`Updating action: ${actionId}`);
         await Action.updateOne({ _id: existingAction._id }, actionData);
       } else {
         logger.info(`Creating action: ${actionId}`);
         await Action.create(actionData);
       }
     }
   }
   ```

4. **Implement Cleanup Logic**
   ```javascript
   async function cleanupRemovedAgents(configuredAgentIds) {
     const logger = createLogger('AgentCleanup');
     const defaultObjectId = process.env.DEFAULT_OBJECT_ID;

     // Find all default agents
     const allDefaultAgents = await Agent.find({ author: defaultObjectId });

     // Identify removed agents
     const removedAgents = allDefaultAgents.filter(
       agent => !configuredAgentIds.includes(agent.id)
     );

     for (const agent of removedAgents) {
       logger.info(`Removing agent: ${agent.id}`);

       // Clean up associated actions
       await Action.deleteMany({ agent_id: agent.id, user: defaultObjectId });

       // Delete agent
       await Agent.deleteOne({ _id: agent._id });
     }
   }
   ```

#### Phase 4: Server Integration (2 hours)

1. **Modify Server Startup**
   ```javascript
   // In api/server/index.js

   const { syncDefaultAgents } = require('./services/DefaultAgents');

   async function startServer() {
     // ... existing code ...

     // Connect to database
     await connectDb();

     // Sync default agents
     logger.info('Synchronizing default agents from configuration...');
     const syncStart = Date.now();

     try {
       const config = await loadCustomConfig();
       await syncDefaultAgents(config);
       const syncDuration = Date.now() - syncStart;
       logger.info(`Default agents synchronized successfully (${syncDuration}ms)`);
     } catch (error) {
       logger.error('Failed to sync default agents:', error);
       // Decide: continue or abort?
       // For now, log and continue
     }

     // ... continue with server startup ...
   }
   ```

#### Phase 5: API Modifications (4-5 hours)

1. **Create Default Agent Access Middleware**
   ```javascript
   // api/server/middleware/checkDefaultAgentAccess.js

   const { logger } = require('~/config');

   async function checkDefaultAgentAccess(req, res, next) {
     const defaultObjectId = process.env.DEFAULT_OBJECT_ID || '000000000000000000000000';
     const { agent_id } = req.params;

     try {
       const agent = await Agent.findOne({ id: agent_id });

       if (!agent) {
         return next();
       }

       // Check if this is a default agent
       if (agent.author.toString() === defaultObjectId) {
         logger.debug(`Granting access to default agent: ${agent_id}`);
         req.isDefaultAgent = true;
         req.agent = agent;
         return next();
       }

       // Not a default agent, proceed with normal permission checks
       next();
     } catch (error) {
       logger.error('Error checking default agent access:', error);
       next(error);
     }
   }

   module.exports = checkDefaultAgentAccess;
   ```

2. **Modify Agent Routes**
   ```javascript
   // api/server/routes/agents/agents.js

   const checkDefaultAgentAccess = require('~/server/middleware/checkDefaultAgentAccess');

   // GET /agents - List agents
   router.get('/', async (req, res) => {
     const { defaultOnly } = req.query;
     const userId = req.user.id;
     const defaultObjectId = process.env.DEFAULT_OBJECT_ID;

     let query;
     if (defaultOnly === 'true') {
       query = { author: defaultObjectId };
     } else {
       query = {
         $or: [
           { author: userId },
           { author: defaultObjectId }
         ]
       };
     }

     const agents = await Agent.find(query);
     res.json(agents);
   });

   // GET /agents/:agent_id - Get single agent
   router.get('/:agent_id', checkDefaultAgentAccess, async (req, res) => {
     if (req.isDefaultAgent) {
       return res.json(req.agent);
     }

     // Normal permission check
     // ... existing code ...
   });
   ```

3. **Update Config Endpoint**
   ```javascript
   // api/server/services/Config/loadCustomConfig.js

   function loadCustomConfig() {
     // ... existing code ...

     const agentsConfig = config.endpoints?.agents || {};
     const hasDefaultAgents = agentsConfig.defaultAgents && agentsConfig.defaultAgents.length > 0;

     return {
       ...config,
       endpoints: {
         ...config.endpoints,
         agents: {
           ...agentsConfig,
           defaultAgentsOnly: hasDefaultAgents,
           disableBuilder: agentsConfig.disableBuilder || false
         }
       }
     };
   }
   ```

#### Phase 6: Frontend Modifications (5-6 hours)

1. **Update Agent Selection Component**
   ```typescript
   // client/src/components/SidePanel/Agents/AgentSelect.tsx

   export default function AgentSelect() {
     const { agentsConfig } = useGetAgentsConfig();
     const { defaultAgentsOnly } = agentsConfig;

     const { data: agents } = useListAgentsQuery({
       defaultOnly: defaultAgentsOnly
     });

     // Filter out non-default agents if needed
     const displayAgents = useMemo(() => {
       if (!defaultAgentsOnly) return agents;

       const defaultObjectId = '000000000000000000000000';
       return agents?.filter(agent =>
         agent.author === defaultObjectId
       ) || [];
     }, [agents, defaultAgentsOnly]);

     return (
       <div>
         <Select>
           {displayAgents.map(agent => (
             <SelectItem key={agent.id} value={agent.id}>
               {agent.name}
             </SelectItem>
           ))}
         </Select>

         {!defaultAgentsOnly && (
           <Button onClick={createNewAgent}>
             Create New Agent
           </Button>
         )}
       </div>
     );
   }
   ```

2. **Update Model Select Component**
   ```typescript
   // client/src/components/Chat/Menus/Models/ModelSelect.tsx

   export default function ModelSelect() {
     const { agentsConfig, endpointsConfig } = useGetEndpointsConfig();
     const { defaultAgentsOnly } = agentsConfig;

     if (defaultAgentsOnly) {
       // Show only agent selection
       return <AgentOnlySelect />;
     }

     // Normal model select with all options
     return <FullModelSelect />;
   }
   ```

3. **Hide Agent Builder**
   ```typescript
   // client/src/components/Nav/NavLinks.tsx

   export default function NavLinks() {
     const { agentsConfig } = useGetAgentsConfig();
     const { disableBuilder } = agentsConfig;

     return (
       <nav>
         {/* ... other nav items ... */}

         {!disableBuilder && (
           <NavLink to="/agents/builder">
             Agent Builder
           </NavLink>
         )}
       </nav>
     );
   }
   ```

4. **Prevent Editing Default Agents**
   ```typescript
   // client/src/components/SidePanel/Agents/AgentPanel.tsx

   export default function AgentPanel({ agentId }) {
     const { data: agent } = useGetAgentByIdQuery(agentId);
     const defaultObjectId = '000000000000000000000000';

     const isDefaultAgent = agent?.author === defaultObjectId;

     if (isDefaultAgent) {
       return <AgentReadOnlyView agent={agent} />;
     }

     return <AgentEditView agent={agent} />;
   }
   ```

#### Phase 7: Token Tracking Verification (2-3 hours)

1. **Review Current Implementation**
   - Examine `spendTokens()` function
   - Examine transaction creation
   - Trace through agent execution flow
   - Verify tokens are tracked for actions

2. **Test with Default Agents**
   - Create test default agent
   - Execute agent with actions
   - Verify transactions are created
   - Verify balance is updated
   - Check transaction details

3. **Add Logging if Missing**
   - Log transaction creation
   - Log token calculations
   - Log balance updates

**Expected Result**: Token tracking should work without modifications, as default agents use the same execution flow as regular agents.

#### Phase 8: Debug Logging (3-4 hours)

1. **Create Logger Utility**
   ```javascript
   // api/server/utils/logger.js

   const { logger: baseLogger } = require('~/config');

   function createLogger(context) {
     return {
       debug: (message, data) => {
         if (process.env.DEBUG_LOGGING === 'true') {
           baseLogger.debug(`[${context}] ${message}`, data);
         }
       },

       info: (message, data) => {
         baseLogger.info(`[${context}] ${message}`, data);
       },

       warn: (message, data) => {
         baseLogger.warn(`[${context}] ${message}`, data);
       },

       error: (message, error, data) => {
         baseLogger.error(`[${context}] ${message}`, {
           error: error.message,
           stack: error.stack,
           ...data
         });
       }
     };
   }

   module.exports = { createLogger };
   ```

2. **Add Logging Throughout**
   - Configuration loading
   - File operations
   - Database operations
   - API requests
   - Permission checks
   - Errors and exceptions

#### Phase 9: Documentation (3-4 hours)

1. **Update Configuration Examples**
   - Complete `librechat.example.yaml`
   - Complete `.env.example`
   - Create example directory structure
   - Create example files

2. **Create Feature Documentation**
   - Overview and benefits
   - Configuration guide
   - Troubleshooting guide
   - FAQ section

3. **Create Migration Guide**
   - For existing deployments
   - For Docker users
   - For manual deployments

---

## Testing Plan

### Unit Tests

1. **Configuration Parsing**
   - Valid configurations
   - Invalid configurations
   - Missing required fields
   - File reference validation

2. **File Loading**
   - Text files
   - YAML files
   - JSON files
   - Binary files (icons)
   - Non-existent files
   - Path traversal attempts

3. **Hash Calculation**
   - Consistent hashing
   - Change detection
   - Edge cases

4. **Synchronization Logic**
   - Create new agents
   - Update existing agents
   - No changes needed
   - Cleanup removed agents

### Integration Tests

1. **Server Startup**
   - Clean database
   - Existing default agents
   - Configuration changes
   - Sync failures

2. **API Endpoints**
   - List default agents
   - Access default agents
   - Filter agents
   - Permission checks

3. **Frontend**
   - Agent selection
   - Model selection
   - Builder visibility
   - Read-only views

### End-to-End Tests

1. **Full Workflow**
   - Configure default agents
   - Start server
   - Verify database state
   - Login as user
   - Select default agent
   - Execute agent
   - Verify token tracking

2. **Update Workflow**
   - Change configuration
   - Restart server
   - Verify updates applied
   - Verify existing data preserved

3. **Cleanup Workflow**
   - Remove agent from config
   - Restart server
   - Verify agent removed
   - Verify actions cleaned up

### Manual Testing

1. **User Experience**
   - Clean UI (only agents visible)
   - Agent selection works
   - Agent execution works
   - No errors in console

2. **Admin Experience**
   - Easy configuration
   - Clear error messages
   - Helpful debug logs

---

## Rollout Strategy

### Phase 1: Development

1. Implement features in development environment
2. Test with various configurations
3. Fix bugs and issues
4. Optimize performance

### Phase 2: Documentation

1. Complete all documentation
2. Create examples
3. Write migration guide
4. Prepare announcement

### Phase 3: Beta Testing

1. Deploy to test environment
2. Invite beta testers
3. Gather feedback
4. Make improvements

### Phase 4: Release

1. Create release branch
2. Final testing
3. Merge to main
4. Tag release
5. Publish documentation
6. Announce feature

### Phase 5: Support

1. Monitor for issues
2. Respond to questions
3. Fix bugs
4. Iterate based on feedback

---

## Potential Challenges and Solutions

### Challenge 1: File Path Resolution

**Problem**: Users may specify relative or absolute paths, paths may not exist.

**Solution**:
- Support both relative (to config directory) and absolute paths
- Clear error messages for non-existent files
- Path traversal prevention
- Fallback to inline configuration

### Challenge 2: Icon Storage

**Problem**: Different storage backends (local, S3, Firebase).

**Solution**:
- Use existing file upload utilities
- Support all configured storage backends
- Handle upload failures gracefully
- Allow inline data URLs as fallback

### Challenge 3: Configuration Validation

**Problem**: Invalid configurations can break sync process.

**Solution**:
- Comprehensive validation with Zod
- Clear error messages
- Fail fast on invalid config
- Provide helpful debugging info

### Challenge 4: Database Sync Performance

**Problem**: Syncing many agents on every startup may be slow.

**Solution**:
- Use hash-based change detection
- Only update when necessary
- Batch database operations
- Implement caching if needed
- Make sync async (non-blocking)

### Challenge 5: Migration for Existing Users

**Problem**: Existing deployments need to adopt new feature.

**Solution**:
- Feature is opt-in (only enabled if configured)
- No breaking changes
- Clear migration guide
- Backward compatibility

---

## Success Criteria

### Functional Requirements

- ✅ Default agents can be defined in `librechat.yaml`
- ✅ Default agents are available to all users
- ✅ UI shows only default agents when configured
- ✅ Custom endpoints and assistants are hidden
- ✅ Agent Builder can be disabled
- ✅ File-based configurations work (specs, instructions, icons)
- ✅ Database sync happens automatically on startup
- ✅ Token tracking works correctly
- ✅ Comprehensive debug logging is available

### Non-Functional Requirements

- ✅ No database schema changes
- ✅ No new UI components
- ✅ Sync completes in <10 seconds for typical configs
- ✅ Clear error messages for misconfigurations
- ✅ Comprehensive documentation
- ✅ Backward compatible with existing deployments

### User Experience

- ✅ Admin: Easy to configure default agents
- ✅ Admin: Clear feedback during sync
- ✅ Admin: Easy to troubleshoot issues
- ✅ User: Clean, uncluttered UI
- ✅ User: Only relevant options visible
- ✅ User: Seamless agent execution

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Configuration Setup | 2-3 hours | None |
| Phase 2: File Loading | 3-4 hours | Phase 1 |
| Phase 3: Sync Service | 6-8 hours | Phase 1, 2 |
| Phase 4: Server Integration | 2 hours | Phase 3 |
| Phase 5: API Modifications | 4-5 hours | Phase 4 |
| Phase 6: Frontend Modifications | 5-6 hours | Phase 5 |
| Phase 7: Token Verification | 2-3 hours | Phase 6 |
| Phase 8: Debug Logging | 3-4 hours | All phases |
| Phase 9: Documentation | 3-4 hours | All phases |
| **Total** | **30-37 hours** | |

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding default agents functionality to LibreChat. The design:

1. **Reuses existing infrastructure**: No schema changes, uses existing agent/action models
2. **Is non-breaking**: Opt-in feature, backward compatible
3. **Is well-tested**: Comprehensive testing plan
4. **Is well-documented**: Complete examples and guides
5. **Is maintainable**: Clean code, comprehensive logging
6. **Provides great UX**: Clean UI for users, easy config for admins

The phased approach allows for incremental development and testing, reducing risk and ensuring quality at each step.

---

## Appendix

### File Structure

```
api/
├── models/
│   ├── Agent.js (existing)
│   ├── Action.js (existing)
│   ├── spendTokens.js (existing)
│   └── Transaction.js (existing)
├── server/
│   ├── controllers/
│   │   └── agents/
│   │       └── v1.js (modify)
│   ├── middleware/
│   │   └── checkDefaultAgentAccess.js (create)
│   ├── routes/
│   │   └── agents/
│   │       ├── agents.js (modify)
│   │       └── actions.js (existing)
│   ├── services/
│   │   ├── Config/
│   │   │   └── loadCustomConfig.js (modify)
│   │   └── DefaultAgents/
│   │       ├── index.js (create)
│   │       ├── sync.js (create)
│   │       ├── logger.js (create)
│   │       └── hashUtils.js (create)
│   └── utils/
│       ├── files/
│       │   ├── loadConfigFile.js (create)
│       │   ├── processIconFile.js (create)
│       │   └── validateConfigFile.js (create)
│       └── logger.js (create)

client/
└── src/
    ├── components/
    │   ├── Chat/
    │   │   └── Menus/
    │   │       └── Models/
    │   │           └── ModelSelect.tsx (modify)
    │   ├── Nav/
    │   │   └── NavLinks.tsx (modify)
    │   └── SidePanel/
    │       └── Agents/
    │           ├── AgentSelect.tsx (modify)
    │           └── AgentPanel.tsx (modify)
    └── hooks/
        └── Agents/
            └── useGetAgentsConfig.ts (modify)

packages/
└── data-schemas/
    └── src/
        ├── app/
        │   └── agents.ts (modify)
        └── types/
            └── config.ts (modify)

# Configuration files
.env.example (modify)
librechat.example.yaml (modify)

# Example configurations
agents/
├── customer-support/
│   ├── instructions.txt (create)
│   └── icon.png (create)
└── sales/
    ├── instructions.txt (create)
    └── icon.png (create)

actions/
├── customer-support/
│   └── openapi.yaml (create)
└── sales/
    └── crm-api.yaml (create)

# Documentation
docs/
└── features/
    └── default-agents.md (create)
```

### Key Dependencies

- Existing agent/action infrastructure
- MongoDB
- librechat.yaml configuration system
- File storage system (local/S3/Firebase)
- React Query for frontend data fetching
- Existing authentication/authorization system

### Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEFAULT_OBJECT_ID` | `000000000000000000000000` | Object ID for default agents/actions |
| `DEBUG_LOGGING` | `false` | Enable detailed debug logging |
| `{ACTION}_API_KEY` | - | API keys for default agent actions |

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Author**: Claude Code
**Status**: Ready for Implementation
