# showUserActionDebug Configuration Implementation Plan

## Overview

This feature adds a new `showUserActionDebug` boolean property to the `agents` configuration in `librechat.yaml` that controls visibility of agent action debugging information. When set to `false`, regular users (USER role) will not see the expander button on "Ran <operation_name>" messages, preventing them from viewing the request/response details that agents send to APIs. Administrators (ADMIN role) will always have access to this debugging information regardless of the setting.

The implementation leverages existing patterns in LibreChat: the configuration flows from backend validation through React Query to frontend components, and role-based access control uses the existing user session data. The solution is designed to be minimally invasive, touching only the necessary validation, typing, and rendering layers.

## Core Components

### 1. Backend Configuration Schema & Validation

**Files to modify:**
- `packages/data-schemas/src/types/agents.ts`
- `packages/data-schemas/src/schema/agents.ts` 
- `api/server/services/Config/loadConfigEndpoints.js`

**Changes:**

**a) Add TypeScript type definition** (`packages/data-schemas/src/types/agents.ts`):
```typescript
export type TAgentsEndpoint = {
  // ... existing properties ...
  showUserActionDebug?: boolean; // New optional property
};
```

**b) Add Zod schema validation** (`packages/data-schemas/src/schema/agents.ts`):
```typescript
export const agentsEndpointSchema = z.object({
  // ... existing fields ...
  showUserActionDebug: z.boolean().optional(), // Defaults to undefined (treated as true)
});
```

**c) Update configuration loader** (`api/server/services/Config/loadConfigEndpoints.js`):

Add to the agents endpoint processing section (around line 400-450):
```javascript
if (endpoint.showUserActionDebug !== undefined) {
  agentsConfig.showUserActionDebug = endpoint.showUserActionDebug;
}
```

This ensures the property is passed through to the frontend configuration.

### 2. Frontend Type Definitions

**File to modify:**
- `client/src/common/agents-types.ts` or `packages/data-provider/src/types/agents.ts`

**Changes:**

Add the property to the frontend agents configuration type:
```typescript
export interface AgentsConfig {
  // ... existing properties ...
  showUserActionDebug?: boolean;
}
```

### 3. ToolCall Component Logic

**File to modify:**
- `client/src/components/Chat/Messages/Content/ToolCall.tsx`

**Current behavior analysis:**
The ToolCall component renders agent tool executions with a collapsible panel. The `ProgressText` component receives a `hasInput` prop that controls both button interactivity and chevron visibility. Currently, all tool calls show the expander button.

**Implementation strategy:**

**a) Add necessary imports and hooks:**
```typescript
import { useGetAgentsConfig } from '~/hooks/Agents/useGetAgentsConfig';
import useAuthContext from '~/hooks/useAuthContext';
import { UserRole } from 'librechat-data-provider'; // or wherever UserRole enum is defined
```

**b) Add hooks at component start:**
```typescript
const { user } = useAuthContext();
const { data: agentsConfig } = useGetAgentsConfig();
```

**c) Implement inline permission check in hasInput calculation:**

Find the existing line where `hasInput` is determined (likely around where ProgressText is rendered):

```typescript
// Determine if debug info should be shown
const canShowDebug = React.useMemo(() => {
  // If showUserActionDebug is undefined or true, show debug (default behavior)
  if (agentsConfig?.showUserActionDebug !== false) {
    return true;
  }
  
  // If false, only show for ADMIN role
  return user?.role === UserRole.ADMIN;
}, [agentsConfig?.showUserActionDebug, user?.role]);

// Use canShowDebug to control hasInput
const hasInput = tool.output && canShowDebug;
```

**d) Pass hasInput to ProgressText:**
```tsx
<ProgressText
  // ... other props ...
  hasInput={hasInput}
/>
```

**Why this approach:**
- **Uses existing useGetAgentsConfig hook**: Consistent with codebase patterns, already provides React Query caching and invalidation
- **Inline permission check**: Simple, efficient, and keeps logic close to where it's used
- **useMemo optimization**: Prevents unnecessary recalculations on every render
- **No active state management**: The disabled button naturally prevents expansion when `hasInput` is false, avoiding complexity
- **Graceful degradation**: Defaults to showing debug info if config is unavailable or undefined

### 4. useEffect Considerations

**No changes required to useEffect hooks** because:

1. **React Query automatic updates**: The `useGetAgentsConfig` hook uses React Query, which automatically handles cache invalidation and refetching when configuration changes on the backend
2. **Component will re-render naturally**: When `agentsConfig` updates from React Query, the component re-renders automatically
3. **useMemo dependencies**: The `useMemo` hook with `[agentsConfig?.showUserActionDebug, user?.role]` dependencies ensures the permission check recalculates only when these values change
4. **No cleanup needed**: Since we're not managing expanded state or subscriptions, there's no cleanup required

**If you were to add manual refetching** (optional, not recommended unless needed):
```typescript
useEffect(() => {
  // React Query handles this automatically, but if you need manual refetch:
  // refetch();
}, [/* typically empty */]);
```

### 5. Documentation Update

**File to modify:**
- `librechat.example.yaml`

**Changes:**

Update the agents configuration section (around lines 246-263):
```yaml
# agents:
#   # (optional) Default recursion depth for agents, defaults to 25
#   recursionLimit: 50
#   # (optional) Max recursion depth for agents, defaults to 25
#   maxRecursionLimit: 100
#   # (optional) Disable the builder interface for agents
#   disableBuilder: false
#   # (optional) Maximum total citations to include in agent responses, defaults to 30
#   maxCitations: 30
#   # (optional) Maximum citations per file to include in agent responses, defaults to 7
#   maxCitationsPerFile: 7
#   # (optional) Minimum relevance score for sources to be included in responses, defaults to 0.45 (45% relevance threshold)
#   # Set to 0.0 to show all sources (no filtering), or higher like 0.7 for stricter filtering
#   minRelevanceScore: 0.45
#   # (optional) Sets the default agent used when none is specified by the client
#   defaultAgent: "uuid_of_agent"
#   # (optional) Agent Capabilities available to all users. Omit the ones you wish to exclude. Defaults to list below.
#   capabilities: ["execute_code", "file_search", "actions", "tools"]
#   # (optional) Show debug information for agent actions to users, defaults to true
#   # When false, only ADMIN role users can see the "Ran <operation>" expander button
#   # Regular users will not see what the agent sends to APIs or receives in responses
#   showUserActionDebug: true
```

## Implementation Checklist

1. **Backend Schema** (packages/data-schemas):
   - [ ] Add `showUserActionDebug?: boolean` to TypeScript type in `types/agents.ts`
   - [ ] Add `showUserActionDebug: z.boolean().optional()` to Zod schema in `schema/agents.ts`

2. **Backend Configuration Loader** (api/server/services/Config):
   - [ ] Update `loadConfigEndpoints.js` to pass through `showUserActionDebug` property

3. **Frontend Types** (client/src or packages/data-provider):
   - [ ] Add `showUserActionDebug?: boolean` to frontend AgentsConfig interface

4. **Frontend Component** (client/src/components/Chat/Messages/Content):
   - [ ] Import `useGetAgentsConfig`, `useAuthContext`, and `UserRole` in ToolCall.tsx
   - [ ] Add hooks at component start
   - [ ] Implement `canShowDebug` useMemo with permission logic
   - [ ] Update `hasInput` calculation to use `canShowDebug`
   - [ ] Verify ProgressText receives the updated `hasInput` prop

5. **Documentation**:
   - [ ] Update `librechat.example.yaml` with new configuration option and detailed comments

## Testing Recommendations

1. **Configuration variations**:
   - Test with `showUserActionDebug: true` (should show debug for all users)
   - Test with `showUserActionDebug: false` (should hide for USER role, show for ADMIN)
   - Test with property omitted (should default to showing debug for all users)

2. **Role-based access**:
   - Login as USER role → verify expander hidden when config is false
   - Login as ADMIN role → verify expander always visible
   - Switch roles in same browser session → verify UI updates correctly

3. **Edge cases**:
   - Configuration not loaded yet (React Query pending state)
   - User object not available
   - Tool calls with no output

4. **Performance**:
   - Check that message history with many tool calls renders efficiently
   - Verify no unnecessary re-renders when config hasn't changed

---

This plan provides a minimal, targeted implementation that integrates cleanly with LibreChat's existing architecture. The solution respects the principle of least surprise by defaulting to the current behavior (showing debug info) and only restricting visibility when explicitly configured.