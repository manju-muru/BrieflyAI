-- BrieflyAI initial schema
-- Run this in Supabase SQL editor, or via `supabase db push`

create extension if not exists "uuid-ossp";

-- ============================================================
-- LECTURES
-- ============================================================
create table lectures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Untitled Lecture',
  subject text,
  audio_url text,                     -- path in Supabase Storage
  duration_seconds numeric,
  status text not null default 'recording'
    check (status in ('recording', 'uploaded', 'transcribing', 'transcribed', 'generating', 'ready', 'error')),
  transcript jsonb,                   -- full transcript: [{text, start_sec, end_sec, speaker?}]
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TOPICS  (a lecture gets segmented into topics by the LLM)
-- ============================================================
create table topics (
  id uuid primary key default uuid_generate_v4(),
  lecture_id uuid references lectures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  summary text,                       -- short summary of this topic
  start_sec numeric,
  end_sec numeric,
  order_index int default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- REVISION NOTES
-- ============================================================
create table revision_notes (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,              -- markdown-formatted notes
  created_at timestamptz not null default now()
);

-- ============================================================
-- FLASHCARDS
-- ============================================================
create table flashcards (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  question text not null,
  answer text not null,
  priority int not null default 0,    -- higher = show first; boosted when linked to a confusion flag
  is_from_confusion boolean not null default false,
  confusion_flag_id uuid references confusion_flags(id) on delete set null,
  last_reviewed_at timestamptz,
  review_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- EXAM QUESTIONS
-- ============================================================
create table exam_questions (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  question text not null,
  answer text not null,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONFUSION FLAGS  (the core differentiator feature)
-- ============================================================
create table confusion_flags (
  id uuid primary key default uuid_generate_v4(),
  lecture_id uuid references lectures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  timestamp_sec numeric not null,           -- exact moment flagged during recording/playback
  transcript_excerpt text,                  -- the surrounding transcript chunk, filled in after transcription
  reexplanation text,                       -- slower, example-rich re-explanation (generated on demand)
  reexplanation_status text not null default 'pending'
    check (reexplanation_status in ('pending', 'generating', 'ready', 'error')),
  resolved boolean not null default false,  -- user marks as "got it now"
  created_at timestamptz not null default now()
);

-- fix forward reference from flashcards -> confusion_flags
alter table flashcards
  add constraint flashcards_confusion_flag_fk
  foreign key (confusion_flag_id) references confusion_flags(id) on delete set null;

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_lectures_user on lectures(user_id, created_at desc);
create index idx_topics_lecture on topics(lecture_id, order_index);
create index idx_flashcards_topic on flashcards(topic_id);
create index idx_flashcards_priority on flashcards(user_id, priority desc);
create index idx_confusion_lecture on confusion_flags(lecture_id, timestamp_sec);
create index idx_exam_questions_topic on exam_questions(topic_id);

-- ============================================================
-- ROW LEVEL SECURITY — each student only sees their own data
-- ============================================================
alter table lectures enable row level security;
alter table topics enable row level security;
alter table revision_notes enable row level security;
alter table flashcards enable row level security;
alter table exam_questions enable row level security;
alter table confusion_flags enable row level security;

create policy "own lectures" on lectures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own topics" on topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes" on revision_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own flashcards" on flashcards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own exam_questions" on exam_questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own confusion_flags" on confusion_flags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET for lecture audio
-- ============================================================
insert into storage.buckets (id, name, public) values ('lecture-audio', 'lecture-audio', false)
on conflict (id) do nothing;

create policy "own audio upload" on storage.objects for insert
  with check (bucket_id = 'lecture-audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own audio read" on storage.objects for select
  using (bucket_id = 'lecture-audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own audio delete" on storage.objects for delete
  using (bucket_id = 'lecture-audio' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- updated_at trigger for lectures
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_lectures_updated_at
  before update on lectures
  for each row execute function set_updated_at();
