Feature flags:
In client/src/components/Nav/Settings.tsx
for hidding tabs such as Balance, Account, Commands, Speech:
balanceTabShow 
accountTabShow
commandsTabShow
speechTabShow

In client/src/components/Nav/SettingsTabs/Data/Data.tsx in Data Controls tab for hidding such options as "Revoke all user provided credentials" with "Revoke" button, and
"Import conversation" option with "Import" button:
RevokeKeysOptionShow
ImportConversationsOptionShow

In client/src/components/Nav/AccountSettings.tsx for hidding Balance:
balanceShow

In client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx for hidding such conversation options as Duplicate and Archive:
archieveConvoOptionShow
duplicateConvoOptionShow

In client/src/components/Chat/ExportAndShareMenu.tsx for hidding Export option that appears when clicked on Share conversation button:
exportConvoShow




