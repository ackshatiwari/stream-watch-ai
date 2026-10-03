-- Scraped qualitative sources (VDH, DC Water, WSSC, per-basin PDFs)

create table scraped_documents (
  id            bigserial primary key,
  source        text not null,                      -- e.g. 'DC Water'
  source_url    text not null,
  title         text,
  content       text not null,                      -- summarized content
  content_hash  text generated always as (md5(content)) stored,
  published_on  date,
  captured_at   timestamptz not null default now(),
  unique (source_url, content_hash)                 -- prevents duplicate rows
);