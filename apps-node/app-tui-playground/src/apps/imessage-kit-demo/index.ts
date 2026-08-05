import { IMessageSDK } from '@photon-ai/imessage-kit';
import { differenceInDays } from 'date-fns';

// v3 dropped `watcher` from IMessageConfig — pollInterval / unreadOnly /
// excludeOwnMessages no longer exist anywhere in the package, and watching is
// configured at `sdk.startWatching(events)` instead. This demo only lists
// chats and never started a watcher, so the block was configuring nothing.
const sdk = new IMessageSDK({ debug: true });

// Both filters moved into the query in v3: `kind: 'dm'` replaces the old
// `!chat.isGroup` post-filter (Chat now carries `kind: 'dm' | 'group' |
// 'unknown'`), and `service: 'iMessage'` replaces matching the `iMessage;`
// prefix off chatId by hand.
const chats = await sdk.listChats({ kind: 'dm', service: 'iMessage' });

// Recency is not part of ChatQuery, so it stays a post-filter. `lastMessageAt`
// is already a Date in v3, so it needs no re-parsing.
const last3DayChats = chats.filter(
  (chat) => chat.lastMessageAt !== null && differenceInDays(new Date(), chat.lastMessageAt) <= 3
);

console.log(last3DayChats);
