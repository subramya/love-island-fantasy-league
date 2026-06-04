alter table chat_messages
add column if not exists message_type text default 'user';

alter table chat_messages
add column if not exists reply_to_message_id uuid references chat_messages(id);
