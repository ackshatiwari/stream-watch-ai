-- 15-min USGS readings and parsed NWS forecast points. One narrow row per reading. Kept ~90 days.

create table recent_observations (
  site_no       text not null references sites(site_no),
  parameter_cd  text not null,                      -- '00060' discharge cfs, '00065' gage height ft
  observed_at   timestamptz not null,
  value         double precision,                   -- null when USGS reports no value (ice, equipment)
  qualifiers    text,                               -- 'P' provisional, 'A' approved, 'e' estimated, 'Ice', etc.
  source        text not null,                      -- 'usgs_iv', 'nws_forecast', ...
  captured_at   timestamptz not null default now(),
  primary key (site_no, parameter_cd, source, observed_at)
);