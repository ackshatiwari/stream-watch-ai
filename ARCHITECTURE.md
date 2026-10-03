# Database Architecture

## 1. Reference: sites

Prototype-sites = [01646000 ("DIFFICULT RUN NEAR GREAT FALLS, VA"),
                   01668000 ("RAPPAHANNOCK RIVER NEAR FREDERICKSBURG, VA"),
                   01638500 ("POTOMAC RIVER AT POINT OF ROCKS, MD")]


create table sites (
  site_no            text primary key,              -- USGS site number, e.g. '01646500'
  agency_cd          text not null default 'USGS',
  name               text not null,                 -- Potomac River Near Little Falls
  latitude           double precision,
  longitude          double precision,
  drainage_area_sqmi double precision,
  active             boolean not null default true
);

## 2. Recent observations (15-min USGS, parsed NWS forecast points) -- Keep ~90 days. One narrow row per reading.

create table recent_observations (
  site_no       text not null references sites(site_no), -- foreign key relationship to the sites table
  parameter_cd  text not null,                      -- '00060' discharge cfs, '00065' gage height ft
  observed_at   timestamptz not null,
  value         double precision,                   -- null when USGS reports no value (ice, equipment)
  qualifiers    text,                               -- 'P' provisional, 'A' approved, 'e' estimated, 'Ice', etc.
  source        text not null,                      -- 'usgs_iv', 'nws_forecast', ...
  captured_at   timestamptz not null default now(),
  primary key (site_no, parameter_cd, source, observed_at)
);

- Delete data that is older than 90 days

## 3. Scraped qualitative sources (VDH, DC Water, WSSC, per-basin PDFs)

create table scraped_documents (
  id            bigserial primary key,              -- primary key
  source        text not null,                      -- DC Water (or other appropriate source name)
  source_url    text not null,                      -- url
  title         text,                                  
  content       text not null,                      -- summarized
  content_hash  text generated always as (md5(content)) stored, --unique id so duplicate rows aren't added
  published_on  date,
  captured_at   timestamptz not null default now(),
  unique (source_url, content_hash)
);


# Auth

Supabase Auth will be used

## Tier 1: anonymous questions

There's no auth here, but this is your biggest cost and abuse surface, because every anonymous question is an LLM call you pay for.

- Per-IP rate limit at the API route, for example 10–20 questions per hour, using Upstash Redis or similar.
- Global daily spend cap that degrades gracefully: if you hit it, show raw gauge data and charts without the LLM answer.

## Tier 2: accounts, saved rivers, email digest

## Tier 3: teachers, orgs, and people making dashbaords

