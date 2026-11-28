-- Money moved to people or between own accounts never waits in the Inbox (owner rule); the AI used to send some there.
update public.transactions set needs_review = false where needs_review and movement in ('person', 'moved');
