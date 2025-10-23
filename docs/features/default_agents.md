# Default Agents Feature

## Overview

The Default Agents feature allows administrators to define agents in `librechat.yaml` that are automatically available to all users. When configured, the UI can be restricted to show only these default agents, hiding all other options like custom endpoints and assistants.

## Key Features

- **Centralized Configuration**: Define agents once in `librechat.yaml`
- **Automatic Synchronization**: Agents sync to database on server startup
- **Universal Access**: All authenticated users can access default agents
- **UI Restriction**: Option to show ONLY default agents in model selector
- **Read-Only**: Default agents cannot be modified or deleted by users
- **File-Based Configuration**: Support for external files (specs, instructions, icons)
- **Builder Control**: Option to hide Agent Builder panel
- **Token Tracking**: Full token/credit tracking for default agent usage

## Quick Start

### 1. Configure Default Agents

Add to your `librechat.yaml`:

```yaml
endpoints:
  agents:
    disableBuilder: true  # Hide Agent Builder from users
    defaultAgents:
      - id: "support-agent"
        name: "Customer Support"
        description: "Helps with customer inquiries"
        instructions: "You are a helpful customer support agent."
        provider: "openai"
        model: "gpt-4o"
        tools:
          - "web_search"
```

### 2. Set Environment Variable

In your `.env` file:

```bash
DEFAULT_ACTIONS_OBJECT_ID=000000000000000000000000
```

### 3. Restart Server

```bash
npm run backend  # or docker-compose up
```

The agents will be automatically synced to the database!

## Configuration Options

### Basic Agent Configuration

```yaml
defaultAgents:
  - id: "unique-agent-id"           # Required: Unique identifier
    name: "Agent Name"               # Required: Display name
    provider: "openai"               # Required: openai, anthropic, etc.
    model: "gpt-4o"                  # Required: Model to use

    # Optional fields
    description: "Agent description"
    category: "support"              # For organization
    recursion_limit: 25              # Max recursion depth
```

### Instructions

**Option 1: Inline Instructions**
```yaml
instructions: "You are a helpful assistant."
```

**Option 2: File-Based Instructions**
```yaml
instructionsFile: "./agents/support/instructions.txt"
```

### Icons

**Option 1: File-Based Icon**
```yaml
iconFile: "./agents/support/icon.png"
```

**Option 2: Data URL**
```yaml
icon: "data:image/png;base64,iVBORw0KG..."
```

### Model Parameters

```yaml
model_parameters:
  temperature: 0.7
  max_tokens: 2000
  top_p: 0.9
```

### Tools

```yaml
tools:
  - "web_search"
  - "execute_code"
  - "file_search"
```

### Actions (Custom APIs)

**With File-Based Spec:**
```yaml
actions:
  - domain: "api.example.com"
    specFile: "./actions/api-spec.yaml"
    auth:
      type: "service_http"
      api_key: "${MY_API_KEY}"
    privacy_policy_url: "https://example.com/privacy"
```

**With Inline Spec:**
```yaml
actions:
  - domain: "api.example.com"
    spec: |
      openapi: 3.0.0
      info:
        title: My API
        version: 1.0.0
      paths:
        /data:
          get:
            summary: Get data
    auth:
      type: "service_http"
      api_key: "${MY_API_KEY}"
```

### OAuth Actions

```yaml
actions:
  - domain: "crm.example.com"
    specFile: "./actions/crm.yaml"
    auth:
      type: "oauth"
      client_url: "https://crm.example.com/oauth/authorize"
      authorization_url: "https://crm.example.com/oauth/token"
      scope: "read:data write:data"
      oauth_client_id: "${CRM_CLIENT_ID}"
      oauth_client_secret: "${CRM_CLIENT_SECRET}"
```

## Complete Examples

### Example 1: Simple Support Agent

```yaml
endpoints:
  agents:
    disableBuilder: true
    defaultAgents:
      - id: "support"
        name: "Customer Support"
        description: "Helps customers with common questions"
        instructions: "You are a friendly customer support agent."
        provider: "openai"
        model: "gpt-4o-mini"
        tools:
          - "web_search"
```

### Example 2: Technical Agent with File-Based Config

```yaml
endpoints:
  agents:
    disableBuilder: true
    defaultAgents:
      - id: "tech-support"
        name: "Technical Support"
        description: "Provides technical assistance"
        instructionsFile: "./agents/tech/instructions.txt"
        iconFile: "./agents/tech/icon.png"
        provider: "anthropic"
        model: "claude-sonnet-4"
        model_parameters:
          temperature: 0.5
        tools:
          - "execute_code"
          - "web_search"
```

### Example 3: Agent with Custom Actions

```yaml
endpoints:
  agents:
    disableBuilder: true
    defaultAgents:
      - id: "sales-assistant"
        name: "Sales Assistant"
        description: "Helps with sales and CRM operations"
        instructions: "You are a sales assistant with access to our CRM."
        provider: "openai"
        model: "gpt-4o"
        actions:
          - domain: "crm.company.com"
            specFile: "./actions/crm-api.yaml"
            auth:
              type: "oauth"
              client_url: "https://crm.company.com/oauth/authorize"
              authorization_url: "https://crm.company.com/oauth/token"
              scope: "read:contacts write:opportunities"
              oauth_client_id: "${CRM_CLIENT_ID}"
              oauth_client_secret: "${CRM_CLIENT_SECRET}"
```

## Directory Structure

Organize your configuration files:

```
project-root/
├── librechat.yaml
├── .env
└── config/
    ├── agents/
    │   ├── support/
    │   │   ├── instructions.txt
    │   │   └── icon.png
    │   └── sales/
    │       ├── instructions.txt
    │       └── icon.png
    └── actions/
        ├── crm-api.yaml
        └── support-api.yaml
```

## Environment Variables

Add API keys for your actions in `.env`:

```bash
# Default Agents Configuration
DEFAULT_ACTIONS_OBJECT_ID=000000000000000000000000

# Action API Keys
SUPPORT_API_KEY=your-key-here
CRM_CLIENT_ID=your-client-id
CRM_CLIENT_SECRET=your-client-secret
```

Reference in `librechat.yaml`:

```yaml
auth:
  api_key: "${SUPPORT_API_KEY}"
```

## User Experience

### With Default Agents Enabled

✅ Users see ONLY default agents in model selector
✅ Cannot create new agents
✅ Cannot edit default agents
✅ Cannot delete default agents
✅ Agent Builder panel hidden
✅ Clean, focused UI

### Without Default Agents

✅ Users see all endpoints (custom, assistants, etc.)
✅ Can create personal agents
✅ Can edit their agents
✅ Agent Builder available

## Synchronization

### When Sync Happens

- Server startup
- Container restart
- After `librechat.yaml` changes

### What Gets Synced

- Agent properties (name, description, instructions)
- Model configuration
- Tools and actions
- Icons (uploaded to configured storage)
- OpenAPI specs

### Change Detection

The system uses SHA256 hashing to detect changes:

- ✅ Only updates when configuration actually changes
- ✅ Idempotent (safe to run multiple times)
- ✅ Fast (skips unchanged agents)

### Cleanup

Agents removed from `librechat.yaml` are automatically deleted from the database on next sync.

## Permissions

### Default Agent Permissions

| Operation | Allowed |
|-----------|---------|
| View      | ✅ All users |
| Use       | ✅ All users |
| Edit      | ❌ Blocked (403) |
| Delete    | ❌ Blocked (403) |
| Duplicate | ❌ Blocked |

### User Agent Permissions

Normal ACL applies for user-created agents.

## Troubleshooting

### Agents Not Showing Up

1. Check server logs for sync errors:
   ```bash
   docker logs librechat-api | grep DefaultAgents
   ```

2. Verify `librechat.yaml` syntax:
   ```bash
   yamllint librechat.yaml
   ```

3. Check agent configuration is valid:
   - Required fields: `id`, `name`, `provider`, `model`
   - Valid provider names
   - Model available for provider

### Icons Not Displaying

1. Verify file path is correct:
   - Relative to config directory
   - File exists and is readable

2. Check image format:
   - Supported: PNG, JPG, GIF, WebP
   - Maximum size: 5MB

3. Check storage configuration:
   - Local storage: files uploaded to `uploads/`
   - S3/Firebase: check credentials

### Actions Not Working

1. Verify OpenAPI spec is valid:
   ```bash
   npx @redocly/cli lint actions/api-spec.yaml
   ```

2. Check API keys are set in `.env`

3. Verify domain is in `allowedDomains`:
   ```yaml
   actions:
     allowedDomains:
       - 'api.example.com'
   ```

### Enable Debug Logging

Set in `.env`:

```bash
DEBUG_LOGGING=true
```

Then check logs for detailed information:

```bash
docker logs librechat-api | grep "\[DefaultAgents"
```

## Migration Guide

### From Manual Agent Creation

1. Export existing agent configurations
2. Add to `librechat.yaml` as `defaultAgents`
3. Restart server
4. Old agents remain accessible
5. Optionally delete old agents

### Updating Default Agents

1. Edit `librechat.yaml`
2. Restart server
3. Changes automatically applied
4. Version history maintained

## Security Considerations

### API Keys in Configuration

**DO NOT** put API keys directly in `librechat.yaml`!

❌ **Bad:**
```yaml
auth:
  api_key: "sk-1234567890abcdef"
```

✅ **Good:**
```yaml
auth:
  api_key: "${MY_API_KEY}"
```

Then in `.env`:
```bash
MY_API_KEY=sk-1234567890abcdef
```

### File Permissions

Ensure configuration files are not world-readable:

```bash
chmod 600 .env
chmod 644 librechat.yaml
```

### OAuth Secrets

Store OAuth client secrets in `.env`, never in config files.

## Advanced Usage

### Multiple Agent Versions

Create different agents for different use cases:

```yaml
defaultAgents:
  - id: "gpt4-support"
    name: "Premium Support (GPT-4)"
    model: "gpt-4o"

  - id: "gpt35-support"
    name: "Standard Support (GPT-3.5)"
    model: "gpt-3.5-turbo"
```

### Regional Agents

```yaml
defaultAgents:
  - id: "support-us"
    name: "Support (English)"
    instructions: "Respond in English only."

  - id: "support-es"
    name: "Soporte (Español)"
    instructions: "Responde solo en español."
```

### Role-Based Agents

```yaml
defaultAgents:
  - id: "customer-support"
    name: "Customer Support"
    category: "support"

  - id: "sales-assistant"
    name: "Sales Assistant"
    category: "sales"

  - id: "technical-expert"
    name: "Technical Expert"
    category: "engineering"
```

## FAQ

**Q: Can users create their own agents?**
A: If `defaultAgentsOnly` is enabled, no. Otherwise, yes (with proper permissions).

**Q: Can I update default agents without restarting?**
A: No, sync only runs on server startup. Edit `librechat.yaml` and restart.

**Q: Are default agents versioned?**
A: Yes, version history is maintained automatically.

**Q: Can default agents use MCP tools?**
A: Yes, configure MCP servers and include tool names in `tools` array.

**Q: How are tokens tracked?**
A: Same as regular agents - full token tracking with user balance updates.

**Q: Can I have both default and user agents?**
A: Yes! Just don't set `defaultAgentsOnly`. Default agents appear alongside user agents.

**Q: What happens to existing user agents?**
A: They remain unchanged. Default agents are additive.

**Q: Can I use different providers for different agents?**
A: Yes, each agent can have its own provider and model.

## Support

For issues or questions:

1. Check this documentation
2. Review server logs with `DEBUG_LOGGING=true`
3. Check [LibreChat GitHub Issues](https://github.com/danny-avila/LibreChat/issues)
4. Join [LibreChat Discord](https://discord.gg/librechat)

## References

- [LibreChat Configuration](https://docs.librechat.ai/install/configuration/index.html)
- [Agent Documentation](https://docs.librechat.ai/features/agents.html)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Environment Variables](https://docs.librechat.ai/install/configuration/dotenv.html)
